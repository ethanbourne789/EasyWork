import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

/// Mock IMAP server for testing
class MockImapServer {
  final Socket _socket;
  final List<String> _receivedCommands = [];
  String? _response;
  String? _overrideTag;
  final StreamController<String> _commandController = StreamController<String>.broadcast();

  MockImapServer(this._socket) {
    _socket.listen(
      _parseRequest,
      onDone: () {
        _commandController.close();
      },
      onError: (error) {
        _commandController.addError(error);
      },
    );
  }

  Stream<String> get onCommand => _commandController.stream;
  List<String> get receivedCommands => List.unmodifiable(_receivedCommands);

  set response(String? value) => _response = value;

  void _parseRequest(Uint8List data) {
    final line = String.fromCharCodes(data).trim();
    _receivedCommands.add(line);
    _commandController.add(line);

    final firstSpaceIndex = line.indexOf(' ');
    String? tag = firstSpaceIndex == -1 ? '' : line.substring(0, firstSpaceIndex);

    final response = _response;
    if (response != null) {
      if (response.startsWith('+')) {
        _overrideTag = tag;
        final splitIndex = response.indexOf('\r\n');
        final firstLine = response.substring(0, splitIndex + 2);
        _response = response.substring(splitIndex + 2);
        _write(firstLine);
        return;
      }
      if (_overrideTag != null) {
        tag = _overrideTag;
        _overrideTag = null;
      }
      final lines = response.replaceAll('<tag>', tag ?? '').split('\r\n');
      _response = null;
      for (final line in lines) {
        _writeln(line);
      }
      return;
    }
  }

  void _writeln(String data) {
    _write('$data\r\n');
  }

  void _write(String data) {
    _socket.write(data);
  }

  Future<void> fire(Duration duration, String s) async {
    await Future.delayed(duration);
    _write(s);
  }

  void sendGreeting() {
    _write('* OK IMAP server ready\r\n');
  }

  void sendLoginSuccess(String tag) {
    _write('$tag OK LOGIN completed\r\n');
  }

  void sendLoginFailure(String tag) {
    _write('$tag NO LOGIN failed\r\n');
  }

  void sendMailboxList(String tag, List<String> mailboxes) {
    for (final mailbox in mailboxes) {
      _write('* LIST (\\HasNoChildren) "/" "$mailbox"\r\n');
    }
    _write('$tag OK LIST completed\r\n');
  }

  void sendSelectInboxSuccess(String tag) {
    _write('* FLAGS (\\Seen \\Answered \\Flagged \\Deleted \\Draft)\r\n');
    _write('* 10 EXISTS\r\n');
    _write('* 0 RECENT\r\n');
    _write('* OK [UIDVALIDITY 1] UIDs valid\r\n');
    _write('* OK [UIDNEXT 11] Predicted next UID\r\n');
    _write('$tag OK [READ-WRITE] SELECT completed\r\n');
  }

  void sendFetchMessages(String tag, int count) {
    for (int i = 1; i <= count; i++) {
      _write('* $i FETCH (UID $i FLAGS (\\Seen) ENVELOPE ("$i" "Test Subject $i" (("Sender" NIL "sender" "example.com")) (("From" NIL "from" "example.com")) (("To" NIL "to" "example.com")) NIL NIL NIL "<$i@example.com>"))\r\n');
    }
    _write('$tag OK FETCH completed\r\n');
  }

  void sendFetchEmpty(String tag) {
    _write('$tag OK FETCH completed\r\n');
  }

  Future<void> close() async {
    await _socket.close();
  }
}
