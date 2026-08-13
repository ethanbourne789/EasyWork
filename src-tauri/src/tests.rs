use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use crate::AppSharedState;

#[test]
fn test_close_behavior_default_false() {
    let state = AppSharedState {
        close_behavior: Arc::new(AtomicBool::new(false)),
    };
    assert!(!state.close_behavior.load(Ordering::Relaxed));
}

#[test]
fn test_close_behavior_set_true() {
    let state = AppSharedState {
        close_behavior: Arc::new(AtomicBool::new(false)),
    };
    state.close_behavior.store(true, Ordering::Relaxed);
    assert!(state.close_behavior.load(Ordering::Relaxed));
}

#[test]
fn test_close_behavior_toggle() {
    let state = AppSharedState {
        close_behavior: Arc::new(AtomicBool::new(false)),
    };
    assert!(!state.close_behavior.load(Ordering::Relaxed));
    state.close_behavior.store(true, Ordering::Relaxed);
    assert!(state.close_behavior.load(Ordering::Relaxed));
    state.close_behavior.store(false, Ordering::Relaxed);
    assert!(!state.close_behavior.load(Ordering::Relaxed));
}

#[test]
fn test_close_behavior_clone_shares_state() {
    let state = AppSharedState {
        close_behavior: Arc::new(AtomicBool::new(false)),
    };
    let cloned = state.clone();
    cloned.close_behavior.store(true, Ordering::Relaxed);
    assert!(state.close_behavior.load(Ordering::Relaxed));
}

#[test]
fn test_close_behavior_concurrent_access() {
    let state = AppSharedState {
        close_behavior: Arc::new(AtomicBool::new(false)),
    };
    let mut handles = vec![];

    for _ in 0..10 {
        let s = state.clone();
        let handle = std::thread::spawn(move || {
            s.close_behavior.store(true, Ordering::Relaxed);
        });
        handles.push(handle);
    }

    for handle in handles {
        handle.join().unwrap();
    }

    assert!(state.close_behavior.load(Ordering::Relaxed));
}
