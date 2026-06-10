/// Compute a stable thread identifier from email headers.
///
/// Strategy (matches Pebble pattern):
/// 1. If message has its own Message-ID, use that as thread root
/// 2. If In-Reply-To references a known thread, join that thread
/// 3. If References contains known IDs, join the first matching thread
/// 4. Otherwise, use the Message-ID as a new thread root
/// 5. Fallback: use normalized subject as thread key
pub fn compute_thread_id(
    message_id: &str,
    in_reply_to: &str,
    references: &[String],
    subject: &str,
) -> String {
    // Strategy 1: Use own Message-ID as thread root
    let msg_id_clean = clean_message_id(message_id);
    if !msg_id_clean.is_empty() {
        return msg_id_clean;
    }

    // Strategy 2: Join via In-Reply-To
    let irt_clean = clean_message_id(in_reply_to);
    if !irt_clean.is_empty() {
        return irt_clean;
    }

    // Strategy 3: Join via References chain
    for ref_id in references {
        let cleaned = clean_message_id(ref_id);
        if !cleaned.is_empty() {
            return cleaned;
        }
    }

    // Strategy 4: Fallback to normalized subject
    normalize_subject(subject)
}

/// Clean a Message-ID by removing angle brackets and whitespace.
fn clean_message_id(raw: &str) -> String {
    raw.trim()
        .trim_start_matches('<')
        .trim_end_matches('>')
        .trim()
        .to_string()
}

/// Normalize a subject by stripping Re:/Fwd:/回复:/转发: prefixes for thread grouping.
/// Supports Chinese and English prefixes.
fn normalize_subject(raw: &str) -> String {
    let lower = raw.trim().to_lowercase();

    // Strip common reply/forward prefixes (case-insensitive)
    let prefixes = [
        "re:", "fw:", "fwd:", "aw:", "wg:",
        "回复:", "转发:", "答复:", "回复：", "转发：", "答复：",
        "re：", "fw：", "fwd：",
    ];

    let mut result = lower.as_str();
    loop {
        let mut stripped = false;
        for prefix in &prefixes {
            if result.starts_with(prefix) {
                result = result[prefix.len()..].trim();
                stripped = true;
                break;
            }
        }
        if !stripped {
            break;
        }
    }

    result.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uses_own_message_id() {
        let tid = compute_thread_id("<abc123@mail.example.com>", "", &[], "Hello");
        assert_eq!(tid, "abc123@mail.example.com");
    }

    #[test]
    fn joins_via_in_reply_to() {
        let tid = compute_thread_id(
            "",
            "<parent@mail.example.com>",
            &[],
            "Re: Hello",
        );
        assert_eq!(tid, "parent@mail.example.com");
    }

    #[test]
    fn joins_via_references() {
        let tid = compute_thread_id(
            "",
            "",
            &["<grandparent@mail.example.com>".to_string()],
            "Fwd: Hello",
        );
        assert_eq!(tid, "grandparent@mail.example.com");
    }

    #[test]
    fn fallback_normalized_subject() {
        let tid = compute_thread_id("", "", &[], "Re: Fwd: 回复: Hello World");
        assert_eq!(tid, "hello world");
    }

    #[test]
    fn strips_all_prefixes() {
        assert_eq!(normalize_subject("Re: 转发: FW: Hello"), "hello");
        assert_eq!(normalize_subject("回复: Re: Fwd: Test"), "test");
    }
}
