import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import '../services/api_service.dart';

class CallScreen extends StatefulWidget {
  final ApiService api;
  final String callId;
  final String chatId;
  final String? callerId;
  final String callerName;
  final String callType;
  final bool isIncoming;

  const CallScreen({
    super.key,
    required this.api,
    required this.callId,
    required this.chatId,
    this.callerId,
    required this.callerName,
    required this.callType,
    required this.isIncoming,
  });

  @override
  State<CallScreen> createState() => _CallScreenState();
}

class _CallScreenState extends State<CallScreen> {
  RTCPeerConnection? _peerConnection;
  MediaStream? _localStream;
  MediaStream? _remoteStream;
  RTCVideoRenderer? _localRenderer;
  RTCVideoRenderer? _remoteRenderer;

  bool _isConnecting = true;
  // ignore: unused_field
  bool _isConnected = false;
  bool _isMuted = false;
  bool _isCameraOff = false;

  final _iceServers = {
    'iceServers': [
      {'urls': 'stun:stun.l.google.com:19302'},
      {'urls': 'stun:stun1.l.google.com:19302'},
      {'urls': 'stun:stun2.l.google.com:19302'},
      {'urls': 'turn:77.34.76.27:3478', 'username': 'user', 'credential': 'turn-secret-key'},
    ]
  };

  @override
  void initState() {
    super.initState();
    _setupSignalHandler();
    _initWebRTC();
  }

  void _setupSignalHandler() {
    widget.api.onCallSignal = (signalData) {
      if (signalData['callId'] != widget.callId) return;
      
      final signalType = signalData['signalType'] as String?;
      if (signalType == null) return;

      if (signalType == 'offer') {
        _handleIncomingOffer(signalData);
      } else if (signalType == 'answer') {
        _handleIncomingAnswer(signalData);
      } else if (signalType == 'ice-candidate') {
        _handleIncomingIceCandidate(signalData);
      }
    };
  }

  Future<void> _handleIncomingOffer(Map<String, dynamic> signalData) async {
    if (_peerConnection == null) {
      await _createPeerConnection();
    }

    final sdp = signalData['sdp'] as Map<String, dynamic>?;
    if (sdp != null) {
      final description = RTCSessionDescription(
        sdp['sdp'] as String?,
        sdp['type'] as String?,
      );
      await _peerConnection!.setRemoteDescription(description);
      
      final answer = await _peerConnection!.createAnswer();
      await _peerConnection!.setLocalDescription(answer);
      
      _sendSignal({'signalType': 'answer', 'sdp': answer.toMap()});
    }
  }

  Future<void> _handleIncomingAnswer(Map<String, dynamic> signalData) async {
    final sdp = signalData['sdp'] as Map<String, dynamic>?;
    if (sdp != null) {
      final description = RTCSessionDescription(
        sdp['sdp'] as String?,
        sdp['type'] as String?,
      );
      await _peerConnection!.setRemoteDescription(description);
    }
  }

  Future<void> _handleIncomingIceCandidate(Map<String, dynamic> signalData) async {
    final candidate = signalData['candidate'] as Map<String, dynamic>?;
    if (candidate != null && _peerConnection != null) {
      final iceCandidate = RTCIceCandidate(
        candidate['candidate'] as String?,
        candidate['sdpMid'] as String?,
        candidate['sdpMLineIndex'] as int?,
      );
      await _peerConnection!.addCandidate(iceCandidate);
    }
  }

  Future<void> _initWebRTC() async {
    _localRenderer = RTCVideoRenderer();
    _remoteRenderer = RTCVideoRenderer();

    await _localRenderer!.initialize();
    await _remoteRenderer!.initialize();

    _localStream = await navigator.mediaDevices.getUserMedia({
      'audio': true,
      'video': widget.callType == 'video'
          ? {'facingMode': 'user'}
          : false,
    });

    _localRenderer!.srcObject = _localStream;

    if (widget.isIncoming) {
      await _createPeerConnection();
    }
  }

  Future<void> _createPeerConnection() async {
    _peerConnection = await createPeerConnection(_iceServers);

    _peerConnection!.onIceCandidate = (candidate) {
      _sendSignal({'signalType': 'ice-candidate', 'candidate': candidate.toMap()});
    };

    _peerConnection!.onTrack = (event) {
      if (event.streams.isNotEmpty) {
        setState(() {
          _remoteRenderer!.srcObject = event.streams[0];
          _isConnected = true;
          _isConnecting = false;
        });
      }
    };

    _localStream!.getTracks().forEach((track) {
      _peerConnection!.addTrack(track, _localStream!);
    });
  }

  void _sendSignal(Map<String, dynamic> signal) {
    widget.api.sendCallSignal(widget.callId, signal);
  }

  Future<void> _startCall() async {
    await _createPeerConnection();

    final offer = await _peerConnection!.createOffer();
    await _peerConnection!.setLocalDescription(offer);

    _sendSignal({'signalType': 'offer', 'sdp': offer.toMap()});

    setState(() {
      _isConnecting = false;
    });
  }

  Future<void> _acceptCall() async {
    await widget.api.acceptCall(widget.callId);
    await _startCall();
  }

  Future<void> _rejectCall() async {
    await widget.api.rejectCall(widget.callId);
    if (mounted) {
      Navigator.pop(context);
    }
  }

  Future<void> _endCall() async {
    await widget.api.endCall(widget.callId);
    _cleanup();
    if (mounted) {
      Navigator.pop(context);
    }
  }

  void _cleanup() {
    _localStream?.dispose();
    _remoteStream?.dispose();
    _localRenderer?.dispose();
    _remoteRenderer?.dispose();
    _peerConnection?.close();
  }

  void _toggleMute() {
    setState(() {
      _isMuted = !_isMuted;
    });
    _localStream?.getAudioTracks().forEach((track) {
      track.enabled = !_isMuted;
    });
  }

  void _toggleCamera() {
    setState(() {
      _isCameraOff = !_isCameraOff;
    });
    _localStream?.getVideoTracks().forEach((track) {
      track.enabled = !_isCameraOff;
    });
  }

  @override
  void dispose() {
    _cleanup();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text(
          widget.callType == 'video' ? 'Video call' : 'Audio call',
          style: const TextStyle(color: Colors.white),
        ),
      ),
      body: Stack(
        children: [
          // Remote video or placeholder
          if (_remoteRenderer != null && _remoteRenderer!.srcObject != null)
            Positioned.fill(
              child: RTCVideoView(_remoteRenderer!),
            )
          else
            Positioned.fill(
              child: Container(
                color: Colors.grey[900],
                child: Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      CircleAvatar(
                        radius: 50,
                        backgroundColor: Theme.of(context).colorScheme.primaryContainer,
                        child: Icon(Icons.person, size: 50, color: Colors.white),
                      ),
                      const SizedBox(height: 16),
                      const Text(
                        'Connecting...',
                        style: TextStyle(color: Colors.white70, fontSize: 18),
                      ),
                    ],
                  ),
                ),
              ),
            ),

          // Local video
          if (widget.callType == 'video')
            Positioned(
              right: 16,
              top: 100,
              child: Container(
                width: 120,
                height: 160,
                decoration: BoxDecoration(
                  color: Colors.black,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.white24),
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: _localRenderer != null
                      ? RTCVideoView(_localRenderer!)
                      : const Center(child: CircularProgressIndicator()),
                ),
              ),
            ),

          // Call info
          Positioned(
            top: 16,
            left: 0,
            right: 0,
            child: Center(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                decoration: BoxDecoration(
                  color: Colors.black54,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  widget.callerName,
                  style: const TextStyle(color: Colors.white, fontSize: 16),
                ),
              ),
            ),
          ),

          // Controls
          Positioned(
            bottom: 50,
            left: 0,
            right: 0,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (!widget.isIncoming || _isConnected) ...[
                  _buildControlButton(
                    icon: _isMuted ? Icons.mic_off : Icons.mic,
                    onPressed: _toggleMute,
                    isActive: _isMuted,
                  ),
                  const SizedBox(width: 24),
                  if (widget.callType == 'video')
                    _buildControlButton(
                      icon: _isCameraOff ? Icons.videocam_off : Icons.videocam,
                      onPressed: _toggleCamera,
                      isActive: _isCameraOff,
                    ),
                  const SizedBox(width: 24),
                ],
                if (widget.isIncoming && !_isConnected) ...[
                  _buildControlButton(
                    icon: Icons.call_end,
                    onPressed: _rejectCall,
                    isRed: true,
                  ),
                  const SizedBox(width: 24),
                  _buildControlButton(
                    icon: Icons.call,
                    onPressed: _acceptCall,
                    isGreen: true,
                  ),
                ] else ...[
                  _buildControlButton(
                    icon: Icons.call_end,
                    onPressed: _endCall,
                    isRed: true,
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildControlButton({
    required IconData icon,
    required VoidCallback onPressed,
    bool isRed = false,
    bool isGreen = false,
    bool isActive = false,
  }) {
    return Container(
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: isRed
            ? Colors.red
            : isGreen
                ? Colors.green
                : isActive
                    ? Colors.white24
                    : Colors.white12,
      ),
      child: IconButton(
        icon: Icon(icon),
        iconSize: 32,
        color: Colors.white,
        onPressed: onPressed,
      ),
    );
  }
}

class IncomingCallDialog extends StatelessWidget {
  final String callId;
  final String callerName;
  final String callType;
  final VoidCallback onAccept;
  final VoidCallback onReject;

  const IncomingCallDialog({
    super.key,
    required this.callId,
    required this.callerName,
    required this.callType,
    required this.onAccept,
    required this.onReject,
  });

  @override
  Widget build(BuildContext context) {
    return Dialog(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.call,
              size: 48,
              color: Colors.green,
            ),
            const SizedBox(height: 16),
            Text(
              'Incoming $callType call',
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Text(callerName),
            const SizedBox(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                IconButton(
                  icon: const Icon(Icons.call_end, color: Colors.red),
                  iconSize: 40,
                  onPressed: onReject,
                ),
                IconButton(
                  icon: const Icon(Icons.call, color: Colors.green),
                  iconSize: 40,
                  onPressed: onAccept,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
