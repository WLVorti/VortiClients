import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/api_service.dart';
import '../models/models.dart';
import 'home_screen.dart';

class AuthScreen extends StatefulWidget {
  final ApiService api;
  final bool isAddingAccount;

  const AuthScreen({super.key, required this.api, this.isAddingAccount = false});

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final _usernameController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _isLogin = true;
  bool _isLoading = false;
  String? _error;

  // Валидация
  bool _usernameValid = false;
  bool _passwordValid = false;
  String _usernameError = '';
  String _passwordError = '';

  @override
  void initState() {
    super.initState();
    _usernameController.addListener(_validateUsername);
    _passwordController.addListener(_validatePassword);
  }

  void _validateUsername() {
    final username = _usernameController.text.trim();
    setState(() {
      if (username.isEmpty) {
        _usernameValid = false;
        _usernameError = '';
      } else if (username.length < 3) {
        _usernameValid = false;
        _usernameError = 'Минимум 3 символа';
      } else if (username.length > 32) {
        _usernameValid = false;
        _usernameError = 'Максимум 32 символа';
      } else if (!RegExp(r'^[a-zA-Z0-9_]+$').hasMatch(username)) {
        _usernameValid = false;
        _usernameError = 'Только буквы, цифры и _';
      } else {
        _usernameValid = true;
        _usernameError = '';
      }
    });
  }

  int _getPasswordStrength() {
    final password = _passwordController.text;
    int strength = 0;

    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;
    if (RegExp(r'[a-z]').hasMatch(password)) strength++;
    if (RegExp(r'[A-Z]').hasMatch(password)) strength++;
    if (RegExp(r'[0-9]').hasMatch(password)) strength++;
    if (RegExp(r'[!@#$%^&*(),.?":{}|<>]').hasMatch(password)) strength++;

    return strength;
  }

  Color _getStrengthColor(int strength) {
    if (strength <= 2) return Colors.red;
    if (strength <= 4) return Colors.orange;
    return Colors.green;
  }

  String _getStrengthText(int strength) {
    if (strength <= 2) return 'Слабый';
    if (strength <= 4) return 'Средний';
    return 'Надёжный';
  }

  void _validatePassword() {
    final password = _passwordController.text;
    setState(() {
      if (password.isEmpty) {
        _passwordValid = false;
        _passwordError = '';
      } else if (password.length < 8) {
        _passwordValid = false;
        _passwordError = 'Минимум 8 символов';
      } else if (!RegExp(r'[a-z]').hasMatch(password)) {
        _passwordValid = false;
        _passwordError = 'Нужна строчная буква (a-z)';
      } else if (!RegExp(r'[A-Z]').hasMatch(password)) {
        _passwordValid = false;
        _passwordError = 'Нужна заглавная буква (A-Z)';
      } else if (!RegExp(r'[0-9]').hasMatch(password)) {
        _passwordValid = false;
        _passwordError = 'Нужна цифра (0-9)';
      } else if (!RegExp(r'[!@#$%^&*(),.?":{}|<>]').hasMatch(password)) {
        _passwordValid = false;
        _passwordError = 'Нужен спецсимвол';
      } else {
        _passwordValid = true;
        _passwordError = '';
      }
    });
  }

  @override
  void dispose() {
    _usernameController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    // Проверяем валидацию перед отправкой
    _validateUsername();
    _validatePassword();

    if (!_isLogin && (!_usernameValid || !_passwordValid)) {
      setState(() {
        _error = 'Проверьте требования к полям';
      });
      return;
    }

    final username = _usernameController.text.trim();
    final password = _passwordController.text;

    if (username.isEmpty || password.isEmpty) {
      setState(() {
        _error = 'Заполните все поля';
      });
      return;
    }

    setState(() {
      _isLoading = true;
      _error = null;
    });

    final result = _isLogin
        ? await widget.api.login(username, password)
        : await widget.api.register(username, password);

    setState(() => _isLoading = false);

    if (result['status'] == 'success' || result['token'] != null) {
      if (widget.isAddingAccount) {
        final profile = await widget.api.getProfile();
        if (profile != null) {
          await widget.api.addAccount(
            result['token'],
            result['userId'] ?? widget.api.userId ?? '',
            profile.username,
            avatarUrl: profile.avatarUrl,
            displayName: profile.displayName,
          );
          // Register FCM token for the new account
          await widget.api.registerSavedDevice();
        }
        if (mounted) Navigator.pop(context);
      } else {
        if (mounted) {
          Navigator.of(context).pushReplacement(
            MaterialPageRoute(builder: (_) => HomeScreen(api: widget.api)),
          );
        }
      }
    } else {
      setState(() {
        _error = result['message'] ?? 'Ошибка';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const SizedBox(height: 48),
              const Icon(Icons.message, size: 80, color: Colors.blue),
              const SizedBox(height: 16),
              Text(
                'Vorti Messenger',
                style: Theme.of(context).textTheme.headlineMedium,
              ),
              const SizedBox(height: 48),

              // Username
              TextField(
                controller: _usernameController,
                decoration: InputDecoration(
                  labelText: 'Username',
                  hintText: '3-32 символа: буквы, цифры, _',
                  border: const OutlineInputBorder(),
                  prefixIcon: const Icon(Icons.person),
                  errorText: _usernameError.isEmpty ? null : _usernameError,
                  suffixIcon: _usernameValid
                      ? const Icon(Icons.check_circle, color: Colors.green)
                      : null,
                  counterText: '${_usernameController.text.length}/32',
                ),
                maxLength: 32,
                textInputAction: TextInputAction.next,
                autocorrect: false,
              ),
              const SizedBox(height: 16),

              // Password
              TextField(
                controller: _passwordController,
                decoration: InputDecoration(
                  labelText: 'Password',
                  hintText: '8-128 символов',
                  border: const OutlineInputBorder(),
                  prefixIcon: const Icon(Icons.lock),
                  errorText: _passwordError.isEmpty ? null : _passwordError,
                  suffixIcon: _passwordValid
                      ? const Icon(Icons.check_circle, color: Colors.green)
                      : null,
                  counterText: '${_passwordController.text.length}/128',
                ),
                maxLength: 128,
                obscureText: true,
                textInputAction: TextInputAction.done,
                onSubmitted: (_) => _submit(),
              ),

              // Требования к паролю (при регистрации)
              if (!_isLogin) ...[
                if (_passwordController.text.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Expanded(
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(4),
                          child: LinearProgressIndicator(
                            value: _getPasswordStrength() / 6,
                            backgroundColor: Theme.of(
                              context,
                            ).colorScheme.surfaceContainerHighest,
                            valueColor: AlwaysStoppedAnimation<Color>(
                              _getStrengthColor(_getPasswordStrength()),
                            ),
                            minHeight: 6,
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Text(
                        _getStrengthText(_getPasswordStrength()),
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: _getStrengthColor(_getPasswordStrength()),
                        ),
                      ),
                    ],
                  ),
                ],
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Theme.of(
                      context,
                    ).colorScheme.surfaceContainerHighest,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Требования к паролю:',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 12,
                        ),
                      ),
                      const SizedBox(height: 4),
                      _buildRequirement(
                        '8-128 символов',
                        _passwordController.text.length >= 8 &&
                            _passwordController.text.length <= 128,
                      ),
                      _buildRequirement(
                        'Строчная буква (a-z)',
                        RegExp(r'[a-z]').hasMatch(_passwordController.text),
                      ),
                      _buildRequirement(
                        'Заглавная буква (A-Z)',
                        RegExp(r'[A-Z]').hasMatch(_passwordController.text),
                      ),
                      _buildRequirement(
                        'Цифра (0-9)',
                        RegExp(r'[0-9]').hasMatch(_passwordController.text),
                      ),
                      _buildRequirement(
                        'Спецсимвол (!@#\$%^&*...)',
                        RegExp(
                          r'[!@#$%^&*(),.?":{}|<>]',
                        ).hasMatch(_passwordController.text),
                      ),
                    ],
                  ),
                ),
              ],

              if (_error != null) ...[
                const SizedBox(height: 16),
                Text(_error!, style: const TextStyle(color: Colors.red)),
              ],
              const SizedBox(height: 24),

              SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton(
                  onPressed: _isLoading ? null : _submit,
                  child: _isLoading
                      ? const CircularProgressIndicator(color: Colors.white)
                      : Text(_isLogin ? 'Войти' : 'Регистрация'),
                ),
              ),
              const SizedBox(height: 16),
              TextButton(
                onPressed: () => setState(() => _isLogin = !_isLogin),
                child: Text(
                  _isLogin
                      ? 'Нет аккаунта? Зарегистрироваться'
                      : 'Есть аккаунт? Войти',
                ),
              ),
              const SizedBox(height: 48),
              const SizedBox(height: 16),
              TextButton.icon(
                onPressed: () {
                  final logs = ApiService.getLogs();
                  Clipboard.setData(ClipboardData(text: logs));
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Логи скопированы (${ApiService.logs.length} записей)')),
                  );
                },
                icon: const Icon(Icons.bug_report, size: 18),
                label: const Text('Копировать логи'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildRequirement(String text, bool met) {
    return Row(
      children: [
        Icon(
          met ? Icons.check : Icons.circle_outlined,
          size: 14,
          color: met ? Colors.green : Colors.grey,
        ),
        const SizedBox(width: 8),
        Text(
          text,
          style: TextStyle(
            fontSize: 12,
            color: met ? Colors.green : Colors.grey,
          ),
        ),
      ],
    );
  }
}
