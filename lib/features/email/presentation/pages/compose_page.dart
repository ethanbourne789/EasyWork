import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:enough_mail/enough_mail.dart';
import '../../providers/email_providers.dart';
import '../../domain/email_account_entity.dart';

class ComposePage extends ConsumerStatefulWidget {
  final String? to;
  final String? subject;
  final String? body;
  final MimeMessage? replyToMessage;
  final MimeMessage? forwardMessage;

  const ComposePage({
    super.key,
    this.to,
    this.subject,
    this.body,
    this.replyToMessage,
    this.forwardMessage,
  });

  @override
  ConsumerState<ComposePage> createState() => _ComposePageState();
}

class _ComposePageState extends ConsumerState<ComposePage> {
  final _toController = TextEditingController();
  final _subjectController = TextEditingController();
  final _bodyController = TextEditingController();
  bool _isSending = false;
  EmailAccountEntity? _selectedAccount;
  final List<_AttachmentItem> _attachments = [];

  @override
  void initState() {
    super.initState();
    if (widget.to != null) _toController.text = widget.to!;
    if (widget.subject != null) _subjectController.text = widget.subject!;
    if (widget.body != null) _bodyController.text = widget.body!;

    if (widget.replyToMessage != null) {
      final msg = widget.replyToMessage!;
      final from = msg.from?.first.email ?? '';
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
        _bodyController.text = '\n\n---------- 转发的邮件 ----------\n$originalBody';
      }
    }
  }

  @override
  void dispose() {
    _toController.dispose();
    _subjectController.dispose();
    _bodyController.dispose();
    super.dispose();
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

  MimeMessage _buildMessageWithAttachments({
    required String from,
    required List<String> to,
    required String subject,
    required String textBody,
  }) {
    final builder = MessageBuilder()
      ..from = [MailAddress(null, from)]
      ..to = to.map((addr) => MailAddress(null, addr)).toList()
      ..subject = subject
      ..addTextPlain(textBody);

    for (final item in _attachments) {
      final mediaType = _guessMediaType(item.fileName);
      builder.addBinary(
        item.file.readAsBytesSync(),
        mediaType,
        filename: item.fileName,
      );
    }

    return builder.buildMimeMessage();
  }

  MimeMessage _buildReplyWithAttachments({
    required String from,
    required MimeMessage originalMessage,
    required String replyBody,
    bool replyAll = true,
  }) {
    final builder = MessageBuilder.prepareReplyToMessage(
      originalMessage,
      MailAddress(null, from),
      replyAll: replyAll,
    );
    builder.addTextPlain(replyBody);

    for (final item in _attachments) {
      final mediaType = _guessMediaType(item.fileName);
      builder.addBinary(
        item.file.readAsBytesSync(),
        mediaType,
        filename: item.fileName,
      );
    }

    return builder.buildMimeMessage();
  }

  MimeMessage _buildForwardWithAttachments({
    required String from,
    required MimeMessage originalMessage,
    required String forwardBody,
  }) {
    final builder = MessageBuilder.prepareForwardMessage(
      originalMessage,
      from: MailAddress(null, from),
    );
    builder.addTextPlain(forwardBody);

    for (final item in _attachments) {
      final mediaType = _guessMediaType(item.fileName);
      builder.addBinary(
        item.file.readAsBytesSync(),
        mediaType,
        filename: item.fileName,
      );
    }

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
      final toList = _toController.text.split(',').map((s) => s.trim()).where((s) => s.isNotEmpty).toList();

      MimeMessage message;

      if (widget.replyToMessage != null) {
        message = _buildReplyWithAttachments(
          from: _selectedAccount!.email,
          originalMessage: widget.replyToMessage!,
          replyBody: _bodyController.text,
        );
      } else if (widget.forwardMessage != null) {
        message = _buildForwardWithAttachments(
          from: _selectedAccount!.email,
          originalMessage: widget.forwardMessage!,
          forwardBody: _bodyController.text,
        );
      } else {
        message = _buildMessageWithAttachments(
          from: _selectedAccount!.email,
          to: toList,
          subject: _subjectController.text,
          textBody: _bodyController.text,
        );
      }

      await repo.sendEmail(_selectedAccount!.id!, message);

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
              _selectedAccount ??= accounts.first;
              return DropdownButtonFormField<EmailAccountEntity>(
                value: _selectedAccount,
                decoration: const InputDecoration(
                  labelText: '发件账户',
                  border: UnderlineInputBorder(),
                  contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                ),
                items: accounts.map((a) => DropdownMenuItem(
                  value: a,
                  child: Text('${a.displayName} <${a.email}>'),
                )).toList(),
                onChanged: (v) => setState(() => _selectedAccount = v),
              );
            },
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
          ),
          TextField(
            controller: _toController,
            decoration: const InputDecoration(
              labelText: '收件人',
              border: UnderlineInputBorder(),
              contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            ),
            keyboardType: TextInputType.emailAddress,
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
