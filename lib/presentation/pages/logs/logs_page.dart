import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/providers/database_providers.dart';
import '../../../core/database/app_database.dart';
import '../../layouts/responsive_scaffold.dart';

class LogsPage extends ConsumerStatefulWidget {
  const LogsPage({super.key});

  @override
  ConsumerState<LogsPage> createState() => _LogsPageState();
}

class _LogsPageState extends ConsumerState<LogsPage> {
  String _selectedModule = 'ALL';
  String _selectedLevel = 'ALL';
  DateTime? _startDate;
  DateTime? _endDate;
  List<Log> _logs = [];
  bool _isLoading = true;

  final List<String> _modules = [
    'ALL',
    'EMAIL_SYNC',
    'TASK',
    'NOTE',
    'CONTACT',
    'ACCOUNTING',
    'EXERCISE',
    'SETTINGS',
    'SYSTEM',
  ];

  final List<String> _levels = ['ALL', 'INFO', 'WARNING', 'ERROR', 'DEBUG'];

  @override
  void initState() {
    super.initState();
    _loadLogs();
  }

  Future<void> _loadLogs() async {
    setState(() => _isLoading = true);
    try {
      final dao = await ref.read(logsDaoProvider.future);
      // SQL-level filtering, sorting, and limit — avoids loading all logs
      // into memory and filtering/sorting in Dart.
      final logs = await dao.getFilteredLogs(
        module: _selectedModule,
        level: _selectedLevel,
        startDate: _startDate,
        endDate: _endDate,
        limit: 500,
      );

      setState(() {
        _logs = logs;
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('加载日志失败: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return ResponsiveScaffold(
      title: '日志',
      body: Column(
        children: [
          _buildFilterBar(),
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : _logs.isEmpty
                    ? const Center(child: Text('暂无日志'))
                    : _buildLogsList(),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _loadLogs,
        child: const Icon(Icons.refresh),
      ),
    );
  }

  Widget _buildFilterBar() {
    return Container(
      padding: const EdgeInsets.all(8.0),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        border: Border(
          bottom: BorderSide(
            color: Theme.of(context).dividerColor,
          ),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: DropdownButtonFormField<String>(
              value: _selectedModule,
              decoration: const InputDecoration(
                labelText: '模块',
                isDense: true,
                contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              ),
              items: _modules.map((module) {
                return DropdownMenuItem(
                  value: module,
                  child: Text(module == 'ALL' ? '全部模块' : module),
                );
              }).toList(),
              onChanged: (value) {
                setState(() => _selectedModule = value!);
                _loadLogs();
              },
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: DropdownButtonFormField<String>(
              value: _selectedLevel,
              decoration: const InputDecoration(
                labelText: '级别',
                isDense: true,
                contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              ),
              items: _levels.map((level) {
                return DropdownMenuItem(
                  value: level,
                  child: Text(level == 'ALL' ? '全部级别' : level),
                );
              }).toList(),
              onChanged: (value) {
                setState(() => _selectedLevel = value!);
                _loadLogs();
              },
            ),
          ),
          const SizedBox(width: 8),
          IconButton(
            icon: const Icon(Icons.date_range),
            onPressed: _showDateRangePicker,
            tooltip: '选择日期范围',
          ),
          if (_startDate != null || _endDate != null)
            IconButton(
              icon: const Icon(Icons.clear),
              onPressed: () {
                setState(() {
                  _startDate = null;
                  _endDate = null;
                });
                _loadLogs();
              },
              tooltip: '清除日期筛选',
            ),
        ],
      ),
    );
  }

  Widget _buildLogsList() {
    return ListView.builder(
      itemCount: _logs.length,
      itemBuilder: (context, index) {
        final log = _logs[index];
        return RepaintBoundary(child: _buildLogItem(log));
      },
    );
  }

  Widget _buildLogItem(Log log) {
    final levelColor = _getLevelColor(log.level);
    final moduleIcon = _getModuleIcon(log.module);

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      child: ExpansionTile(
        leading: CircleAvatar(
          backgroundColor: levelColor.withValues(alpha: 0.2),
          child: Icon(moduleIcon, color: levelColor, size: 20),
        ),
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: levelColor.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(
                log.level,
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.bold,
                  color: levelColor,
                ),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                log.action,
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 4),
            Text(
              log.message,
              style: TextStyle(
                fontSize: 11,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 4),
            Text(
              _formatDateTime(log.createdAt),
              style: TextStyle(
                fontSize: 10,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
        children: [
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildDetailRow('模块', log.module),
                _buildDetailRow('操作', log.action),
                _buildDetailRow('级别', log.level),
                if (log.refId != null) _buildDetailRow('关联ID', log.refId.toString()),
                _buildDetailRow('时间', _formatDateTime(log.createdAt)),
                const Divider(),
                const Text(
                  '详细信息:',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.surfaceContainerHighest,
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: SelectableText(
                    log.message,
                    style: const TextStyle(fontSize: 12),
                  ),
                ),
                if (log.stackTrace != null && log.stackTrace!.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  const Text(
                    '堆栈跟踪:',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.errorContainer,
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: SelectableText(
                      log.stackTrace!,
                      style: TextStyle(
                        fontSize: 10,
                        color: Theme.of(context).colorScheme.onErrorContainer,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDetailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 60,
            child: Text(
              '$label:',
              style: const TextStyle(
                fontWeight: FontWeight.w500,
                fontSize: 12,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }

  Color _getLevelColor(String level) {
    switch (level.toUpperCase()) {
      case 'ERROR':
        return Colors.red;
      case 'WARNING':
        return Colors.orange;
      case 'INFO':
        return Colors.blue;
      case 'DEBUG':
        return Colors.grey;
      default:
        return Colors.grey;
    }
  }

  IconData _getModuleIcon(String module) {
    switch (module) {
      case 'EMAIL_SYNC':
        return Icons.email;
      case 'TASK':
        return Icons.task_alt;
      case 'NOTE':
        return Icons.note;
      case 'CONTACT':
        return Icons.people;
      case 'ACCOUNTING':
        return Icons.account_balance_wallet;
      case 'EXERCISE':
        return Icons.fitness_center;
      case 'SETTINGS':
        return Icons.settings;
      case 'SYSTEM':
        return Icons.computer;
      default:
        return Icons.info;
    }
  }

  String _formatDateTime(DateTime dateTime) {
    return '${dateTime.year}-${dateTime.month.toString().padLeft(2, '0')}-${dateTime.day.toString().padLeft(2, '0')} '
        '${dateTime.hour.toString().padLeft(2, '0')}:${dateTime.minute.toString().padLeft(2, '0')}:${dateTime.second.toString().padLeft(2, '0')}';
  }

  Future<void> _showDateRangePicker() async {
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime.now().subtract(const Duration(days: 365)),
      lastDate: DateTime.now(),
      initialDateRange: _startDate != null && _endDate != null
          ? DateTimeRange(start: _startDate!, end: _endDate!)
          : null,
    );

    if (picked != null) {
      setState(() {
        _startDate = picked.start;
        _endDate = picked.end;
      });
      _loadLogs();
    }
  }
}
