import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/utils/validators.dart';
import '../../../../l10n/app_localizations.dart';
import '../../../../core/security/credential_store.dart';
import '../../domain/email_account_entity.dart';
import '../../providers/email_providers.dart';
import '../../data/mail_data_source.dart' as ds;
import '../../data/email_providers_config.dart';
import '../../data/email_sync_service.dart';

class EmailAccountFormPage extends ConsumerStatefulWidget {
  final EmailAccountEntity? account;

  const EmailAccountFormPage({super.key, this.account});

  @override
  ConsumerState<EmailAccountFormPage> createState() => _EmailAccountFormPageState();
}

class _EmailAccountFormPageState extends ConsumerState<EmailAccountFormPage> {
  final _formKey = GlobalKey<FormState>();
  final _displayNameController = TextEditingController();
  final _emailController = TextEditingController();
  final _imapHostController = TextEditingController();
  final _imapPortController = TextEditingController(text: '993');
  final _smtpHostController = TextEditingController();
  final _smtpPortController = TextEditingController(text: '465');
  final _passwordController = TextEditingController();
  final _syncIntervalController = TextEditingController(text: '5');
  bool _imapUseSsl = true;
  bool _smtpUseSsl = true;
  bool _isTesting = false;
  bool _isSaving = false;
  String? _testResult;
  String _syncPeriod = '1m';
  late FocusNode _emailFocusNode;

  @override
  void initState() {
    super.initState();
    _emailFocusNode = FocusNode();
    _emailFocusNode.addListener(_onEmailFocusChange);
    if (widget.account != null) {
      _displayNameController.text = widget.account!.displayName;
      _emailController.text = widget.account!.email;
      _imapHostController.text = widget.account!.imapHost;
      _imapPortController.text = widget.account!.imapPort.toString();
      _smtpHostController.text = widget.account!.smtpHost;
      _smtpPortController.text = widget.account!.smtpPort.toString();
      _imapUseSsl = widget.account!.imapUseSsl;
      _smtpUseSsl = widget.account!.smtpUseSsl;
      _syncPeriod = widget.account!.syncPeriod;
      _syncIntervalController.text = widget.account!.syncInterval.toString();
    }
  }

  @override
  void dispose() {
    _emailFocusNode.removeListener(_onEmailFocusChange);
    _emailFocusNode.dispose();
    _displayNameController.dispose();
    _emailController.dispose();
    _imapHostController.dispose();
    _imapPortController.dispose();
    _smtpHostController.dispose();
    _smtpPortController.dispose();
    _passwordController.dispose();
    _syncIntervalController.dispose();
    super.dispose();
  }

  void _onEmailFocusChange() {
    if (!_emailFocusNode.hasFocus) {
      _autoFillProviderConfig();
    }
  }

  void _autoFillProviderConfig() {
    final email = _emailController.text.trim();
    if (email.isEmpty) return;

    final config = getConfigByEmail(email);
    if (config != null) {
      setState(() {
        if (_imapHostController.text.isEmpty) {
          _imapHostController.text = config.imapHost;
          _imapPortController.text = config.imapPort.toString();
          _imapUseSsl = config.imapUseSsl;
        }
        if (_smtpHostController.text.isEmpty) {
          _smtpHostController.text = config.smtpHost;
          _smtpPortController.text = config.smtpPort.toString();
          _smtpUseSsl = config.smtpUseSsl;
        }
        final username = extractUsername(email);
        if (_displayNameController.text.isEmpty) {
          _displayNameController.text = username;
        }
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('已识别邮箱服务商: ${extractDomain(email)}'),
            duration: const Duration(seconds: 1),
          ),
        );
      }
    }
  }

  Future<void> _autoDiscover() async {
    final email = _emailController.text.trim();
    if (email.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('请先输入邮箱地址')),
      );
      return;
    }

    setState(() {
      _isTesting = true;
      _testResult = null;
    });

    try {
      final config = await ds.discoverConfig(email);
      if (config != null && mounted) {
        final result = ds.parseDiscoverConfig(config, email);
        if (result != null) {
          setState(() {
            _imapHostController.text = result.imapHost;
            _imapPortController.text = result.imapPort.toString();
            _imapUseSsl = result.imapUseSsl;
            _smtpHostController.text = result.smtpHost;
            _smtpPortController.text = result.smtpPort.toString();
            _smtpUseSsl = result.smtpUseSsl;
            _testResult = '自动发现成功: IMAP ${result.imapHost}:${result.imapPort}, SMTP ${result.smtpHost}:${result.smtpPort}';
          });
        } else {
          setState(() {
            _testResult = '自动发现成功，但无法解析配置';
          });
        }
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('未能自动发现配置，请手动输入'),
            backgroundColor: Colors.orange,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('自动发现失败: $e'),
            backgroundColor: Colors.orange,
          ),
        );
      }
    } finally {
      setState(() => _isTesting = false);
    }
  }

  Future<void> _testConnection() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _isTesting = true;
      _testResult = null;
    });

    try {
      final result = await ds.testConnection(
        email: _emailController.text.trim(),
        password: _passwordController.text,
        imapHost: _imapHostController.text.trim(),
        imapPort: int.tryParse(_imapPortController.text) ?? 993,
        imapUseSsl: _imapUseSsl,
        smtpHost: _smtpHostController.text.trim(),
        smtpPort: int.tryParse(_smtpPortController.text) ?? 465,
        smtpUseSsl: _smtpUseSsl,
      );

      if (mounted) {
        setState(() {
          _testResult = result.success
              ? '连接成功！发现 ${result.imapFolders} 个文件夹'
              : result.errorMessage ?? '连接失败';
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _testResult = '连接失败: $e');
      }
    } finally {
      setState(() => _isTesting = false);
    }
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isSaving = true);
    try {
      final repo = ref.read(emailRepositoryProvider);
      final account = EmailAccountEntity(
        id: widget.account?.id,
        displayName: _displayNameController.text.trim(),
        email: _emailController.text.trim(),
        password: _passwordController.text.isNotEmpty ? _passwordController.text : null,
        imapHost: _imapHostController.text.trim(),
        imapPort: int.tryParse(_imapPortController.text) ?? 993,
        imapUseSsl: _imapUseSsl,
        smtpHost: _smtpHostController.text.trim(),
        smtpPort: int.tryParse(_smtpPortController.text) ?? 465,
        smtpUseSsl: _smtpUseSsl,
        syncPeriod: _syncPeriod,
        syncInterval: int.tryParse(_syncIntervalController.text) ?? 5,
      );

      if (widget.account != null) {
        await repo.updateAccount(account);
        if (account.password != null && account.password!.isNotEmpty) {
          await CredentialStore().savePassword(account.id!, account.password!);
        }
      } else {
        final accountId = await repo.createAccount(account);
        if (account.password != null && account.password!.isNotEmpty) {
          await CredentialStore().savePassword(accountId, account.password!);
        }
        await _connectAndSync(accountId, account);
      }

      ref.invalidate(emailAccountListProvider);
      if (mounted) {
        Navigator.of(context).popUntil((route) => route.isFirst);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('保存失败: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      setState(() => _isSaving = false);
    }
  }

  Future<void> _connectAndSync(int accountId, EmailAccountEntity account) async {
    if (account.password == null || account.password!.isEmpty) return;

    try {
      final dataSources = ref.read(mailDataSourcesProvider.notifier);
      await dataSources.addAccount(
        accountId: accountId,
        displayName: account.displayName,
        email: account.email,
        password: account.password!,
        imapHost: account.imapHost,
        imapPort: account.imapPort,
        imapUseSsl: account.imapUseSsl,
        smtpHost: account.smtpHost,
        smtpPort: account.smtpPort,
        smtpUseSsl: account.smtpUseSsl,
      );

      final repo = ref.read(emailRepositoryProvider);
      await repo.syncMailboxes(accountId);

      final syncService = ref.read(emailSyncServiceProvider);
      if (syncService != null) {
        await syncService.firstSync(accountId, count: 50);
      }

      ref.invalidate(unifiedMailboxListProvider);
    } catch (e) {
      debugPrint('连接并同步失败: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final loc = EasyWorkLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.account != null ? '编辑账户' : '添加账户'),

      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            TextFormField(
              controller: _displayNameController,
              decoration: const InputDecoration(labelText: '显示名称', hintText: '例如：工作邮箱'),
              validator: (v) => Validators.required(v, '显示名称'),
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _emailController,
              focusNode: _emailFocusNode,
              decoration: InputDecoration(
                labelText: '邮箱地址',
                hintText: '例如：user@example.com',
                suffixIcon: IconButton(
                  icon: const Icon(Icons.auto_fix_high),
                  onPressed: _isTesting ? null : _autoDiscover,
                  tooltip: '自动发现配置',
                ),
              ),
              validator: Validators.email,
              keyboardType: TextInputType.emailAddress,
            ),
            const SizedBox(height: 24),
            Text('IMAP 设置', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            TextFormField(
              controller: _imapHostController,
              decoration: const InputDecoration(labelText: 'IMAP 服务器'),
              validator: (v) => Validators.required(v, 'IMAP 服务器'),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    controller: _imapPortController,
                    decoration: const InputDecoration(labelText: '端口'),
                    validator: Validators.port,
                    keyboardType: TextInputType.number,
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: CheckboxListTile(
                    title: const Text('SSL'),
                    value: _imapUseSsl,
                    onChanged: (v) => setState(() => _imapUseSsl = v ?? true),
                    controlAffinity: ListTileControlAffinity.leading,
                    contentPadding: EdgeInsets.zero,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),
            Text('SMTP 设置', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            TextFormField(
              controller: _smtpHostController,
              decoration: const InputDecoration(labelText: 'SMTP 服务器'),
              validator: (v) => Validators.required(v, 'SMTP 服务器'),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    controller: _smtpPortController,
                    decoration: const InputDecoration(labelText: '端口'),
                    validator: Validators.port,
                    keyboardType: TextInputType.number,
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: CheckboxListTile(
                    title: const Text('SSL'),
                    value: _smtpUseSsl,
                    onChanged: (v) => setState(() => _smtpUseSsl = v ?? true),
                    controlAffinity: ListTileControlAffinity.leading,
                    contentPadding: EdgeInsets.zero,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),
            Text('密码', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            TextFormField(
              controller: _passwordController,
              decoration: const InputDecoration(labelText: '密码'),
              obscureText: true,
              validator: widget.account == null ? Validators.password : null,
            ),
            const SizedBox(height: 24),
            Text('同步设置', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: _syncPeriod,
                    decoration: const InputDecoration(labelText: '同步周期'),
                    items: const [
                      DropdownMenuItem(value: '1w', child: Text('近1周')),
                      DropdownMenuItem(value: '1m', child: Text('近1个月')),
                      DropdownMenuItem(value: '3m', child: Text('近3个月')),
                      DropdownMenuItem(value: '6m', child: Text('近6个月')),
                      DropdownMenuItem(value: '1y', child: Text('近1年')),
                      DropdownMenuItem(value: 'all', child: Text('全部')),
                    ],
                    onChanged: (value) {
                      if (value != null) {
                        setState(() => _syncPeriod = value);
                      }
                    },
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: TextFormField(
                    controller: _syncIntervalController,
                    decoration: const InputDecoration(
                      labelText: '同步间隔',
                      suffixText: '分钟',
                    ),
                    keyboardType: TextInputType.number,
                    validator: (v) {
                      if (v == null || v.isEmpty) return '请输入同步间隔';
                      final value = int.tryParse(v);
                      if (value == null || value < 1) return '至少1分钟';
                      return null;
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),
            if (_testResult != null) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: _testResult!.contains('成功')
                      ? Colors.green.withValues(alpha: 0.1)
                      : Colors.red.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    Icon(
                      _testResult!.contains('成功') ? Icons.check_circle : Icons.error,
                      color: _testResult!.contains('成功') ? Colors.green : Colors.red,
                    ),
                    const SizedBox(width: 8),
                    Expanded(child: Text(_testResult!)),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 24),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _isTesting ? null : _testConnection,
                    icon: _isTesting
                        ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.wifi_find),
                    label: const Text('测试连接'),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: _isSaving ? null : _save,
                    icon: _isSaving
                        ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.save),
                    label: Text(loc.common_save),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
