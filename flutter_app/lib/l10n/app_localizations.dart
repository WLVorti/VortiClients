import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

class AppLocalizations {
  final Locale locale;

  AppLocalizations(this.locale);

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate = _AppLocalizationsDelegate();

  static List<LocalizationsDelegate> get localizationsDelegates {
    return [
      delegate,
      GlobalMaterialLocalizations.delegate,
      GlobalWidgetsLocalizations.delegate,
    ];
  }

  static const supportedLocales = [Locale('en'), Locale('ru')];

  bool get isRu => locale.languageCode == 'ru';

  String localeName(String code) {
    switch (code) {
      case 'en': return 'English';
      case 'ru': return 'Русский';
      default: return code;
    }
  }

  String get account => isRu ? 'Аккаунт' : 'Account';
  String get chats => isRu ? 'Чаты' : 'Chats';
  String get communities => isRu ? 'Сообщества' : 'Communities';
  String get calls => isRu ? 'Звонки' : 'Calls';
  String get settings => isRu ? 'Настройки' : 'Settings';
  String get theme => isRu ? 'Тема' : 'Theme';
  String get language => isRu ? 'Язык' : 'Language';
  String get switchAccount => isRu ? 'Сменить аккаунт' : 'Switch account';
  String get displayName => isRu ? 'Отображаемое имя' : 'Display name';
  String get bio => isRu ? 'О себе' : 'Bio';
  String get custom => isRu ? 'Пользовательская' : 'Custom';
  String get editMessage => isRu ? 'Редактировать сообщение' : 'Edit message';
  String get typeMessage => isRu ? 'Введите сообщение...' : 'Type a message...';
  String get send => isRu ? 'Отправить' : 'Send';
  String get cancel => isRu ? 'Отмена' : 'Cancel';
  String get save => isRu ? 'Сохранить' : 'Save';
  String get delete => isRu ? 'Удалить' : 'Delete';
  String get edit => isRu ? 'Редактировать' : 'Edit';
  String get reply => isRu ? 'Ответить' : 'Reply';
  String get replyToYourself => isRu ? 'Ответ себе' : 'Reply to yourself';
  String get replyToMessage => isRu ? 'Ответ на сообщение' : 'Reply to message';
  String get messageDeleted => isRu ? 'Сообщение удалено' : 'Message deleted';
  String get noMessagesYet => isRu ? 'Пока нет сообщений' : 'No messages yet';
  String get online => isRu ? 'В сети' : 'Online';
  String get offline => isRu ? 'Не в сети' : 'Offline';
  String get typing => isRu ? 'печатает...' : 'typing...';
  String get newChat => isRu ? 'Новый чат' : 'New chat';
  String get newGroup => isRu ? 'Новая группа' : 'New group';
  String get search => isRu ? 'Поиск' : 'Search';
  String get loading => isRu ? 'Загрузка...' : 'Loading...';
  String get error => isRu ? 'Ошибка' : 'Error';
  String get retry => isRu ? 'Повторить' : 'Retry';
  String get copy => isRu ? 'Копировать' : 'Copy';
  String get deleteForever => isRu ? 'Удалить навсегда' : 'Delete forever';
  String get logout => isRu ? 'Выйти' : 'Log out';
  String get logOutConfirm => isRu ? 'Вы уверены, что хотите выйти?' : 'Are you sure you want to log out?';
  String get confirm => isRu ? 'Подтвердить' : 'Confirm';
  String get information => isRu ? 'Информация' : 'Information';
  String get mute => isRu ? 'Выключить звук' : 'Mute';
  String get unmute => isRu ? 'Включить звук' : 'Unmute';
  String get joined => isRu ? 'Присоединился' : 'Joined';
  String get copyDebugLogs => isRu ? 'Копировать логи' : 'Copy debug logs';
  String get logsCopied => isRu ? 'Логи скопированы' : 'Logs copied to clipboard';
  String get entries => isRu ? 'записей' : 'entries';
  String get failedToSend => isRu ? 'Не удалось отправить' : 'Failed to send';
  String get fileTooLarge => isRu ? 'Файл слишком большой (макс. 10МБ)' : 'File too large (max 10MB)';
  String get uploadFailed => isRu ? 'Ошибка загрузки' : 'Upload failed';
  String get messageTooLong => isRu ? 'Сообщение слишком длинное' : 'Message too long';
  String get editMessageHint => isRu ? 'Редактировать сообщение...' : 'Edit message...';
  String get editingMessage => isRu ? 'Редактирование сообщения' : 'Editing message';
  String get recording => isRu ? 'Запись...' : 'Recording...';
  String get startRecording => isRu ? 'Начать запись' : 'Start recording';
  String get stopRecording => isRu ? 'Остановить запись' : 'Stop recording';
  String get pickFromGallery => isRu ? 'Галерея' : 'Gallery';
  String get takePhoto => isRu ? 'Камера' : 'Camera';
  String get attachFile => isRu ? 'Файл' : 'File';
  String get attachMedia => isRu ? 'Прикрепить' : 'Attach';
  String get username => isRu ? 'Имя пользователя' : 'Username';
  String get password => isRu ? 'Пароль' : 'Password';
  String get login => isRu ? 'Войти' : 'Login';
  String get register => isRu ? 'Регистрация' : 'Register';
  String get noAccount => isRu ? 'Нет аккаунта?' : "Don't have an account?";
  String get haveAccount => isRu ? 'Уже есть аккаунт?' : 'Already have an account?';
  String get authError => isRu ? 'Ошибка входа' : 'Authentication error';
  String get usernameRequired => isRu ? 'Имя пользователя (мин. 3 символа)' : 'Username (min 3 characters)';
  String get passwordRequired => isRu ? 'Пароль (мин. 6 символов)' : 'Password (min 6 characters)';
  String get invalidCredentials => isRu ? 'Неверное имя пользователя или пароль' : 'Invalid username or password';
  String minChars(int n) => isRu ? 'Минимум $n символа' : 'Minimum $n characters';
  String maxChars(int n) => isRu ? 'Максимум $n символов' : 'Maximum $n characters';
  String get onlyLetters => isRu ? 'Только буквы, цифры и _' : 'Only letters, numbers and _';

  String get failedToLoadMessages => isRu ? 'Не удалось загрузить сообщения' : 'Failed to load messages';
  String get deleteChat => isRu ? 'Удалить чат' : 'Delete chat';
  String get deleteChatConfirm => isRu ? 'Удалить этот чат?' : 'Delete this chat?';
  String get deleteGroup => isRu ? 'Удалить группу' : 'Delete group';
  String get leaveGroup => isRu ? 'Покинуть группу' : 'Leave group';
  String get addMember => isRu ? 'Добавить участника' : 'Add member';
  String get members => isRu ? 'участников' : 'members';
  String get groups => isRu ? 'Группы' : 'Groups';
  String get contacts => isRu ? 'Контакты' : 'Contacts';
  String get noChats => isRu ? 'Нет чатов' : 'No chats';
  String get searchUsers => isRu ? 'Поиск пользователей' : 'Search users';
  String get createGroup => isRu ? 'Создать группу' : 'Create group';
  String get groupName => isRu ? 'Название группы' : 'Group name';
  String get groupCreated => isRu ? 'Группа создана' : 'Group created';
  String get enterGroupName => isRu ? 'Введите название группы' : 'Enter group name';
  String get failedToCreateGroup => isRu ? 'Не удалось создать группу' : 'Failed to create group';
  String get pressAgainToExit => isRu ? 'Нажмите еще раз для выхода' : 'Press again to exit';
  String get userNotFound => isRu ? 'Пользователь не найден' : 'User not found';
  String get addAccount => isRu ? 'Добавить аккаунт' : 'Add account';
  String get currentAccount => isRu ? 'Текущий аккаунт' : 'Current account';
  String get switchTo => isRu ? 'Переключиться' : 'Switch to';
  String get avatar => isRu ? 'Аватар' : 'Avatar';
  String get removePhoto => isRu ? 'Удалить фото' : 'Remove photo';
  String get changePhoto => isRu ? 'Изменить фото' : 'Change photo';
  String get takePicture => isRu ? 'Сделать снимок' : 'Take picture';
  String get chooseFromGallery => isRu ? 'Выбрать из галереи' : 'Choose from gallery';
  String get camera => isRu ? 'Камера' : 'Camera';
  String get gallery => isRu ? 'Галерея' : 'Gallery';
  String get appLanguage => isRu ? 'Язык приложения' : 'App language';
}

class _AppLocalizationsDelegate extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  bool isSupported(Locale locale) => ['en', 'ru'].contains(locale.languageCode);

  @override
  Future<AppLocalizations> load(Locale locale) => SynchronousFuture(AppLocalizations(locale));

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}
