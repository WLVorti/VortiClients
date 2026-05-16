class Account {
  final String id;
  final String username;
  final String? avatarUrl;
  final String? displayName;

  const Account({
    required this.id,
    required this.username,
    this.avatarUrl,
    this.displayName,
  });

  factory Account.fromJson(Map<String, dynamic> json) {
    return Account(
      id: json['id'] as String? ?? '',
      username: json['username'] as String? ?? '',
      avatarUrl: json['avatar_url'] as String? ?? json['avatarUrl'] as String?,
      displayName: json['display_name'] as String? ?? json['displayName'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'username': username,
        'avatar_url': avatarUrl,
        'display_name': displayName,
      };
}
