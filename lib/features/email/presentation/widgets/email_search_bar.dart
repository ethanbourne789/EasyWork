import 'package:flutter/material.dart';

class EmailSearchBar extends StatefulWidget {
  final ValueChanged<String> onSearch;
  final String? hintText;

  const EmailSearchBar({
    super.key,
    required this.onSearch,
    this.hintText,
  });

  @override
  State<EmailSearchBar> createState() => _EmailSearchBarState();
}

class _EmailSearchBarState extends State<EmailSearchBar> {
  final _controller = TextEditingController();
  bool _showClear = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(8.0),
      child: TextField(
        controller: _controller,
        decoration: InputDecoration(
          hintText: widget.hintText ?? '搜索邮件...',
          prefixIcon: const Icon(Icons.search),
          suffixIcon: _showClear
              ? IconButton(
                  icon: const Icon(Icons.clear),
                  onPressed: () {
                    _controller.clear();
                    setState(() => _showClear = false);
                    widget.onSearch('');
                  },
                )
              : null,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
          ),
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          filled: true,
          fillColor: Theme.of(context).colorScheme.surfaceContainerHighest.withValues(alpha: 0.3),
        ),
        onChanged: (value) {
          setState(() => _showClear = value.isNotEmpty);
          widget.onSearch(value);
        },
      ),
    );
  }
}
