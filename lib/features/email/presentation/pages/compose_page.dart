import 'dart:developer' as dev;
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:enough_mail/enough_mail.dart';
// DKIM signing extension (private API of enough_mail, but stable since 2.x).
import 'package:enough_mail/src/private/util/mail_signature.dart';
import '../../providers/email_providers.dart';
import '../../domain/email_account_entity.dart';
import '../../../../core/providers/database_providers.dart';
import '../../../../core/database/app_database.dart';

class ComposePage extends ConsumerStatefulWidget {
  final String? to;
  final String? subject;
  final String? body;
  final MimeMessage? replyToMessage;
  final MimeMessage? forwardMessage;
  /// Whether [replyToMessage] is a reply-all (true) or reply-to-sender (false).
  /// When false, only the original sender is set as recipient.
  final bool isReplyAll;
  /// Server UID of the original message being replied to / forwarded. Used to
  /// set the \Answered / \Forwarded flag on the server after a successful send.
  final int? originalUid;
  /// Local DB id of the original message, so we can mirror the flag locally.
  final int? originalLocalId;
  /// A saved draft to edit. When provided, the compose fields are pre-filled
  /// with the draft's content and the draft is deleted from the server after
  /// a successful send or save.
  final Email? draftEmail;

  const ComposePage({
    super.key,
    this.to,
    this.subject,
    this.body,
    this.replyToMessage,
    this.forwardMessage,
    this.isReplyAll = false,
    this.originalUid,
    this.originalLocalId,
    this.draftEmail,
  });

  @override
  ConsumerState<ComposePage> createState() => _ComposePageState();
}

class _ComposePageState extends ConsumerState<ComposePage> {
  final _toController = TextEditingController();
  final _ccController = TextEditingController();
  final _bccController = TextEditingController();
  final _subjectController = TextEditingController();
  final _bodyController = TextEditingController();
  bool _isSending = false;
  EmailAccountEntity? _selectedAccount;
  final List<_AttachmentItem> _attachments = [];
  String? _signature;

  @override
  void initState() {
    super.initState();

    // BUG-24: Load draft content if editing a saved draft.
    if (widget.draftEmail != null) {
      final draft = widget.draftEmail!;
      _toController.text = draft.toList ?? '';
      _subjectController.text = draft.subject ?? '';
      _bodyController.text = draft.bodyText ?? draft.bodyHtml ?? '';
    }

    if (widget.to != null) _toController.text = widget.to!;
    if (widget.subject != null) _subjectController.text = widget.subject!;
    if (widget.body != null) _bodyController.text = widget.body!;

    if (widget.replyToMessage != null) {
      final msg = widget.replyToMessage!;
      final from = msg.from?.isNotEmpty == true ? msg.from!.first.email : '';
      if (_toController.text.isEmpty) {
        _toController.text = from;
      }
      if (_subjectController.text.isEmpty) {
        final subject = msg.decodeSubject() ?? '';
        _subjectController.text = subject.startsWith('Re:') ? subject : 'Re: $subject';
      }
    }

    if (widget.forwardMessage != null) {
      final msg = widget.forwardMessage!;
      if (_subjectController.text.isEmpty) {
        final subject = msg.decodeSubject() ?? '';
        _subjectController.text = subject.startsWith('Fwd:') ? subject : 'Fwd: $subject';
      }
      if (widget.body == null) {
        final originalBody = msg.decodeTextPlainPart() ?? '';
        final attachmentCount = msg.findContentInfo(disposition: ContentDisposition.attachment).length;
        final attachmentNote = attachmentCount > 0 ? '\n(包含 $attachmentCount 个附件将随邮件一起转发)' : '';
        _bodyController.text = '\n\n---------- 转发的邮件 ----------\n$originalBody$attachmentNote';
      }
    }

    // BUG-11: initialise the default account + signature AFTER the first frame
    // instead of mutating state inside [build]. Accounts are provided
    // asynchronously, so reading them here would also be unreliable.
    WidgetsBinding.instance.addPostFrameCallback((_) => _initDefaultAccount());
  }

  Future<void> _initDefaultAccount() async {
    if (!mounted) return;
    final accounts = ref.read(emailAccountListProvider).valueOrNull;
    if (accounts == null || accounts.isEmpty) return;
    if (_selectedAccount == null && mounted) {
      setState(() => _selectedAccount = accounts.first);
    }
    if (_signature == null) {
      await _loadSignature();
    }
  }

  @override
  void dispose() {
    _toController.dispose();
    _ccController.dispose();
    _bccController.dispose();
    _subjectController.dispose();
    _bodyController.dispose();
    super.dispose();
  }

  Future<void> _loadSignature() async {
    if (_selectedAccount?.id == null) return;
    final sigDaoAsync = ref.read(emailSignaturesDaoProvider);
    final sigDao = sigDaoAsync.valueOrNull;
    if (sigDao == null) return;
    final sig = await sigDao.getDefaultSignature();
    if (sig != null && sig.content.isNotEmpty && mounted) {
      setState(() => _signature = sig.content);
    }
  }

  Future<void> _pickAttachments() async {
    try {
      final result = await FilePicker.platform.pickFiles(allowMultiple: true);
      if (result != null && result.files.isNotEmpty) {
        setState(() {
          for (final file in result.files) {
            if (file.path != null) {
              _attachments.add(_AttachmentItem(
                file: File(file.path!),
                fileName: file.name,
                size: file.size,
              ));
            }
          }
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('选择附件失败: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  void _removeAttachment(int index) {
    setState(() => _attachments.removeAt(index));
  }

  MediaType _guessMediaType(String fileName) {
    final ext = fileName.split('.').last.toLowerCase();
    final mime = switch (ext) {
      'jpg' || 'jpeg' => 'image/jpeg',
      'png' => 'image/png',
      'gif' => 'image/gif',
      'pdf' => 'application/pdf',
      'doc' || 'docx' => 'application/msword',
      'xls' || 'xlsx' => 'application/vnd.ms-excel',
      'txt' => 'text/plain',
      'html' => 'text/html',
      'zip' => 'application/zip',
      _ => 'application/octet-stream',
    };
    return MediaType.fromText(mime);
  }

  /// Sign the message builder with DKIM if the selected account has DKIM
  /// configured (domain, selector, and private key all set).
  void _signWithDkim(MessageBuilder builder) {
    final account = _selectedAccount;
    if (account == null || !account.hasDkimConfig) return;

    try {
      builder.sign(
        privateKey: account.dkimPrivateKey!,
        domain: account.dkimDomain,
        selector: account.dkimSelector,
      );
      dev.log('DKIM 签名已添加: domain=${account.dkimDomain}, selector=${account.dkimSelector}',
          name: 'ComposePage');
    } catch (e) {
      dev.log('DKIM 签名失败: $e', name: 'ComposePage');
    }
  }

  Future<MimeMessage> _buildMessageWithAttachmentsAsync({
    required String from,
    required List<String> to,
    required String subject,
    required String textBody,
    List<String> cc = const [],
    List<String> bcc = const [],
    String? fromDisplayName,
  }) async {
    final bodyWithSig = _signature != null && textBody.isNotEmpty
        ? '$textBody\n\n-- \n$_signature'
        : textBody;
    final builder = MessageBuilder()
      ..from = [MailAddress(fromDisplayName, from)]
      ..to = to.map((addr) => MailAddress(null, addr)).toList()
      ..subject = subject
      ..addTextPlain(bodyWithSig);

    if (cc.isNotEmpty) {
      builder.cc = cc.map((addr) => MailAddress(null, addr)).toList();
    }
    if (bcc.isNotEmpty) {
      builder.bcc = bcc.map((addr) => MailAddress(null, addr)).toList();
    }

    for (final item in _attachments) {
      final mediaType = _guessMediaType(item.fileName);
      final bytes = await item.file.readAsBytes();
      builder.addBinary(bytes, mediaType, filename: item.fileName);
    }

    _signWithDkim(builder);
    return builder.buildMimeMessage();
  }

  Future<MimeMessage> _buildReplyWithAttachmentsAsync({
    required String from,
    required MimeMessage originalMessage,
    required String replyBody,
    bool replyAll = true,
    String? fromDisplayName,
    List<String>? toRecipients,
    List<String>? ccRecipients,
  }) async {
    final originalText = originalMessage.decodeTextPlainPart() ?? '';
    final fullReplyText = '$replyBody\n\n> ${originalText.replaceAll('\n', '\n> ')}';

    final builder = MessageBuilder.prepareReplyToMessage(
      originalMessage,
      MailAddress(fromDisplayName, from),
      replyAll: replyAll,
      quoteOriginalText: false,
    );
    builder.addTextPlain(fullReplyText);

    // BUG-37: Override recipients with the user-edited To/Cc fields.
    // prepareReplyToMessage sets recipients based on the original message,
    // ignoring any edits the user made in the compose UI. We need to
    // respect the user's explicit recipient choices.
    if (toRecipients != null && toRecipients.isNotEmpty) {
      builder.to = toRecipients.map((addr) => MailAddress(null, addr)).toList();
    }
    if (ccRecipients != null && ccRecipients.isNotEmpty) {
      builder.cc = ccRecipients.map((addr) => MailAddress(null, addr)).toList();
    } else if (ccRecipients != null) {
      // Explicitly clear CC if the user removed all CC recipients.
      builder.cc = [];
    }

    for (final item in _attachments) {
      final mediaType = _guessMediaType(item.fileName);
      final bytes = await item.file.readAsBytes();
      builder.addBinary(bytes, mediaType, filename: item.fileName);
    }

    _signWithDkim(builder);
    return builder.buildMimeMessage();
  }

  Future<MimeMessage> _buildForwardWithAttachmentsAsync({
    required String from,
    required MimeMessage originalMessage,
    required String forwardBody,
    String? fromDisplayName,
  }) async {
    final originalText = originalMessage.decodeTextPlainPart() ?? '';
    final fullForwardText = '$forwardBody\n\n---------- 转发的邮件 ----------\n$originalText';

    final builder = MessageBuilder.prepareForwardMessage(
      originalMessage,
      from: MailAddress(fromDisplayName, from),
      forwardAttachments: true,
    );
    builder.addTextPlain(fullForwardText);

    for (final item in _attachments) {
      final mediaType = _guessMediaType(item.fileName);
      final bytes = await item.file.readAsBytes();
      builder.addBinary(bytes, mediaType, filename: item.fileName);
    }

    _signWithDkim(builder);
    return builder.buildMimeMessage();
  }

  Future<void> _send() async {
    if (_toController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('请输入收件人')),
      );
      return;
    }

    if (_selectedAccount == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('请先选择发件账户')),
      );
      return;
    }

    setState(() => _isSending = true);
    try {
      final repo = ref.read(emailRepositoryProvider);
      if (repo == null) return;
      final toList = _toController.text.split(',').map((s) => s.trim()).where((s) => s.isNotEmpty).toList();

      MimeMessage message;

      final ccList = _ccController.text.split(',').map((s) => s.trim()).where((s) => s.isNotEmpty).toList();
      final bccList = _bccController.text.split(',').map((s) => s.trim()).where((s) => s.isNotEmpty).toList();

      final displayName = _selectedAccount!.displayName;

      if (widget.replyToMessage != null) {
        message = await _buildReplyWithAttachmentsAsync(
          from: _selectedAccount!.email,
          originalMessage: widget.replyToMessage!,
          replyBody: _bodyController.text,
          replyAll: widget.isReplyAll,
          fromDisplayName: displayName,
          toRecipients: toList,
          ccRecipients: ccList,
        );
      } else if (widget.forwardMessage != null) {
        message = await _buildForwardWithAttachmentsAsync(
          from: _selectedAccount!.email,
          originalMessage: widget.forwardMessage!,
          forwardBody: _bodyController.text,
          fromDisplayName: displayName,
        );
      } else {
        message = await _buildMessageWithAttachmentsAsync(
          from: _selectedAccount!.email,
          to: toList,
          subject: _subjectController.text,
          textBody: _bodyController.text,
          cc: ccList,
          bcc: bccList,
          fromDisplayName: displayName,
        );
      }

      await repo.sendEmail(_selectedAccount!.id!, message);

      // #21: set the \Answered / \Forwarded flag on the original message so it
      // is reflected both on the server (via UID) and in the local DB, instead
      // of being left unmarked after a reply/forward.
      final isReply = widget.replyToMessage != null;
      final isForward = widget.forwardMessage != null;
      if (widget.originalUid != null) {
        final ds = ref.read(mailDataSourcesProvider)[_selectedAccount!.id!];
        if (ds != null) {
          try {
            if (isReply) {
              await ds.markAnsweredByUid(widget.originalUid!);
            } else if (isForward) {
              await ds.markForwardedByUid(widget.originalUid!);
            }
          } catch (e) {
            dev.log('标记已回复/转发(服务端)失败: $e', name: 'ComposePage');
          }
        }
      }
      if (widget.originalLocalId != null) {
        final emailsDao = ref.read(emailsDaoProvider).valueOrNull;
        if (emailsDao != null) {
          try {
            if (isReply) {
              await emailsDao.markAnswered(widget.originalLocalId!);
            } else if (isForward) {
              await emailsDao.markForwarded(widget.originalLocalId!);
            }
          } catch (e) {
            dev.log('标记已回复/转发(本地)失败: $e', name: 'ComposePage');
          }
        }
      }

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('发送成功'), backgroundColor: Colors.green),
        );
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('发送失败: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      setState(() => _isSending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final accountsAsync = ref.watch(emailAccountListProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(_getAppBarTitle()),
        actions: [
          IconButton(
            icon: const Icon(Icons.save_outlined),
            onPressed: _isSending ? null : _saveDraft,
            tooltip: '保存草稿',
          ),
          IconButton(
            icon: const Icon(Icons.attach_file),
            onPressed: _pickAttachments,
            tooltip: '添加附件',
          ),
          TextButton(
            onPressed: _isSending ? null : _send,
            child: _isSending
                ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('发送'),
          ),
        ],
      ),
      body: Column(
        children: [
          accountsAsync.when(
            data: (accounts) {
              if (accounts.isEmpty) {
                return const Padding(
                  padding: EdgeInsets.all(16),
                  child: Text('未配置邮箱账户', style: TextStyle(color: Colors.red)),
                );
              }
              final effectiveAccount = _selectedAccount ?? accounts.first;
              return DropdownButtonFormField<EmailAccountEntity>(
                value: effectiveAccount,
                decoration: const InputDecoration(
                  labelText: '发件账户',
                  border: UnderlineInputBorder(),
                  contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                ),
                items: accounts.map((a) => DropdownMenuItem(
                  value: a,
                  child: Text('${a.displayName} <${a.email}>'),
                )).toList(),
                onChanged: (v) {
                  setState(() => _selectedAccount = v);
                  _loadSignature();
                },
              );
            },
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
          ),
          _RecipientAutocompleteField(
            controller: _toController,
            label: '收件人',
          ),
          _RecipientAutocompleteField(
            controller: _ccController,
            label: '抄送 (CC)',
          ),
          _RecipientAutocompleteField(
            controller: _bccController,
            label: '密送 (BCC)',
          ),
          TextField(
            controller: _subjectController,
            decoration: const InputDecoration(
              labelText: '主题',
              border: UnderlineInputBorder(),
              contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            ),
          ),
          if (_attachments.isNotEmpty)
            SizedBox(
              height: 50,
              child: ListView.builder(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 8),
                itemCount: _attachments.length,
                itemBuilder: (context, index) {
                  final item = _attachments[index];
                  return Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
                    child: InputChip(
                      label: Text(item.fileName, style: const TextStyle(fontSize: 12)),
                      deleteIcon: const Icon(Icons.close, size: 16),
                      onDeleted: () => _removeAttachment(index),
                    ),
                  );
                },
              ),
            ),
          const Divider(),
          Expanded(
            child: TextField(
              controller: _bodyController,
              decoration: const InputDecoration(
                border: InputBorder.none,
                contentPadding: EdgeInsets.all(16),
              ),
              maxLines: null,
              expands: true,
              textAlignVertical: TextAlignVertical.top,
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _saveDraft() async {
    if (_selectedAccount == null) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('请先选择发件账户')),
        );
      }
      return;
    }

    try {
      final toList = _toController.text.split(',').map((s) => s.trim()).where((s) => s.isNotEmpty).toList();
      final builder = MessageBuilder()
        ..from = [MailAddress(_selectedAccount!.displayName, _selectedAccount!.email)]
        ..to = toList.map((addr) => MailAddress(null, addr)).toList()
        ..subject = _subjectController.text;

      if (_ccController.text.isNotEmpty) {
        builder.cc = _ccController.text.split(',').map((s) => s.trim()).where((s) => s.isNotEmpty)
            .map((addr) => MailAddress(null, addr)).toList();
      }
      if (_bccController.text.isNotEmpty) {
        builder.bcc = _bccController.text.split(',').map((s) => s.trim()).where((s) => s.isNotEmpty)
            .map((addr) => MailAddress(null, addr)).toList();
      }

      if (_bodyController.text.isNotEmpty) {
        builder.addTextPlain(_bodyController.text);
      }

      for (final item in _attachments) {
        final mediaType = _guessMediaType(item.fileName);
        builder.addBinary(
          item.file.readAsBytesSync(),
          mediaType,
          filename: item.fileName,
        );
      }

      final message = builder.buildMimeMessage();
      final ds = ref.read(mailDataSourcesProvider)[_selectedAccount!.id!];
      if (ds != null) {
        // BUG-24: Delete the old draft from the server if editing.
        if (widget.draftEmail != null && widget.draftEmail!.uid != null) {
          try {
            await ds.deleteMessageByUid(widget.draftEmail!.uid!);
          } catch (e) {
            dev.log('删除旧草稿失败: $e', name: 'ComposePage');
          }
        }
        await ds.saveDraft(message);
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('草稿已保存'), backgroundColor: Colors.green),
          );
        }
      } else {
        // BUG-36: Previously the save was silently skipped when the account
        // was not connected. Now inform the user so they know the draft was
        // not saved.
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('账户未连接，草稿未保存。请先连接账户后重试。'),
              backgroundColor: Colors.orange,
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('保存草稿失败: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  String _getAppBarTitle() {
    if (widget.replyToMessage != null) return '回复';
    if (widget.forwardMessage != null) return '转发';
    return '写邮件';
  }
}

class _AttachmentItem {
  final File file;
  final String fileName;
  final int size;

  const _AttachmentItem({
    required this.file,
    required this.fileName,
    required this.size,
  });
}

/// A lightweight contact email entry used for autocomplete suggestions.
class _ContactSuggestion {
  final String displayName;
  final String email;

  const _ContactSuggestion({required this.displayName, required this.email});
}

/// Recipient text field with contact autocomplete.
///
/// Supports multiple recipients separated by commas. As the user types,
/// the field suggests matching contacts from the local database. Selecting
/// a suggestion inserts the contact's email address at the cursor position.
class _RecipientAutocompleteField extends ConsumerStatefulWidget {
  final TextEditingController controller;
  final String label;

  const _RecipientAutocompleteField({
    super.key,
    required this.controller,
    required this.label,
  });

  @override
  ConsumerState<_RecipientAutocompleteField> createState() =>
      _RecipientAutocompleteFieldState();
}

class _RecipientAutocompleteFieldState
    extends ConsumerState<_RecipientAutocompleteField> {
  final _focusNode = FocusNode();
  final _layerLink = LayerLink();
  OverlayEntry? _overlayEntry;
  List<_ContactSuggestion> _suggestions = [];
  List<_ContactSuggestion> _allContacts = [];
  bool _loadedContacts = false;

  @override
  void initState() {
    super.initState();
    _focusNode.addListener(_onFocusChanged);
    widget.controller.addListener(_onTextChanged);
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadContacts());
  }

  @override
  void dispose() {
    // BUG-32: Remove the text-changed listener to prevent a use-after-free
    // crash. Without this, the controller notifies a disposed widget when
    // the parent ComposePage disposes the TextEditingController.
    widget.controller.removeListener(_onTextChanged);
    _focusNode.removeListener(_onFocusChanged);
    _focusNode.dispose();
    _hideOverlay();
    super.dispose();
  }

  Future<void> _loadContacts() async {
    if (_loadedContacts) return;
    final contactsDao = ref.read(contactsDaoProvider).valueOrNull;
    if (contactsDao == null) return;

    try {
      final contacts = await contactsDao.getAllContacts();
      final list = <_ContactSuggestion>[];
      for (final c in contacts) {
        // emailAddresses may contain multiple emails separated by commas
        // or newlines.
        final raw = c.emailAddresses;
        if (raw == null || raw.trim().isEmpty) continue;
        final emails = raw
            .split(RegExp(r'[,\n;]'))
            .map((e) => e.trim())
            .where((e) => e.isNotEmpty && e.contains('@'));
        for (final email in emails) {
          list.add(_ContactSuggestion(
            displayName: c.displayName,
            email: email,
          ));
        }
      }
      _allContacts = list;
      _loadedContacts = true;
    } catch (e) {
      dev.log('加载联系人失败: $e', name: 'RecipientAutocomplete');
    }
  }

  void _onFocusChanged() {
    if (!_focusNode.hasFocus) {
      _hideOverlay();
    }
  }

  void _onTextChanged() {
    final text = widget.controller.text;

    // Extract the current segment being typed (after the last separator).
    final cursorPos = widget.controller.selection.baseOffset;
    final beforeCursor =
        cursorPos >= 0 && cursorPos <= text.length ? text.substring(0, cursorPos) : text;
    final lastSeparator = beforeCursor.lastIndexOf(RegExp(r'[,;]'));
    final segmentStart = lastSeparator >= 0 ? lastSeparator + 1 : 0;
    final query = beforeCursor.substring(segmentStart).trim();

    if (query.isEmpty || query.length < 1) {
      _hideOverlay();
      return;
    }

    final lowerQuery = query.toLowerCase();
    _suggestions = _allContacts
        .where((c) =>
            c.email.toLowerCase().contains(lowerQuery) ||
            c.displayName.toLowerCase().contains(lowerQuery))
        .take(8)
        .toList();

    if (_suggestions.isEmpty) {
      _hideOverlay();
    } else {
      _showOverlay();
    }
  }

  void _showOverlay() {
    if (_overlayEntry != null) {
      _overlayEntry!.markNeedsBuild();
      return;
    }
    _overlayEntry = OverlayEntry(
      builder: (context) => _buildOverlay(),
    );
    Overlay.of(context).insert(_overlayEntry!);
  }

  void _hideOverlay() {
    _overlayEntry?.remove();
    _overlayEntry = null;
  }

  Widget _buildOverlay() {
    final renderBox = context.findRenderObject() as RenderBox;
    final width = renderBox.size.width;
    return Positioned(
      width: width,
      child: CompositedTransformFollower(
        link: _layerLink,
        showWhenUnlinked: false,
        offset: Offset(0, renderBox.size.height),
        child: Material(
          elevation: 4,
          borderRadius: BorderRadius.circular(8),
          child: ListView(
            shrinkWrap: true,
            padding: EdgeInsets.zero,
            children: _suggestions.map((s) {
              return ListTile(
                dense: true,
                leading: CircleAvatar(
                  radius: 16,
                  child: Text(
                    s.displayName.isNotEmpty
                        ? s.displayName[0].toUpperCase()
                        : '?',
                    style: const TextStyle(fontSize: 12),
                  ),
                ),
                title: Text(s.displayName,
                    style: const TextStyle(fontWeight: FontWeight.w500)),
                subtitle: Text(s.email, style: const TextStyle(fontSize: 12)),
                onTap: () => _selectSuggestion(s),
              );
            }).toList(),
          ),
        ),
      ),
    );
  }

  void _selectSuggestion(_ContactSuggestion suggestion) {
    final text = widget.controller.text;
    final cursorPos = widget.controller.selection.baseOffset;
    final beforeCursor =
        cursorPos >= 0 && cursorPos <= text.length ? text.substring(0, cursorPos) : text;
    final afterCursor = cursorPos >= 0 && cursorPos <= text.length
        ? text.substring(cursorPos)
        : '';

    final lastSeparator = beforeCursor.lastIndexOf(RegExp(r'[,;]'));
    final segmentStart = lastSeparator >= 0 ? lastSeparator + 1 : 0;

    // Reconstruct: text before current segment + selected email + text after cursor
    final prefix = beforeCursor.substring(0, segmentStart);
    final needsCommaBefore =
        prefix.isNotEmpty && !prefix.endsWith(',') && !prefix.endsWith(' ');
    final insertion =
        '${needsCommaBefore ? ', ' : ''}${suggestion.email}, ';
    final newText = '$prefix$insertion$afterCursor';
    final newCursorPos = prefix.length + insertion.length;

    widget.controller.value = TextEditingValue(
      text: newText,
      selection: TextSelection.collapsed(offset: newCursorPos),
    );
    _hideOverlay();
  }

  @override
  Widget build(BuildContext context) {
    return CompositedTransformTarget(
      link: _layerLink,
      child: TextField(
        controller: widget.controller,
        focusNode: _focusNode,
        decoration: InputDecoration(
          labelText: widget.label,
          border: const UnderlineInputBorder(),
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        ),
        keyboardType: TextInputType.emailAddress,
      ),
    );
  }
}
