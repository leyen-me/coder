//! Platform-specific native window chrome customization.

use tauri::{AppHandle, Manager, WebviewWindow};

/// Applies the host platform's native window chrome policies to the given
/// window obtained from the app handle by label.
pub fn apply_to_window(app: &AppHandle, label: &str) {
    let Some(window) = app.get_webview_window(label) else {
        log::warn!("window \"{label}\" not found; skipping window chrome setup");
        return;
    };
    apply(&window);
}

/// Applies the host platform's native window chrome policies.
pub fn apply(window: &WebviewWindow) {
    #[cfg(windows)]
    windows::apply_round_corners(window);

    #[cfg(not(windows))]
    let _ = window;
}

#[cfg(windows)]
mod windows {
    use std::ffi::c_void;

    use tauri::WebviewWindow;

    const DWMWA_WINDOW_CORNER_PREFERENCE: u32 = 33;
    const DWMWCP_ROUND: u32 = 2;
    const S_OK: i32 = 0;

    #[link(name = "dwmapi")]
    extern "system" {
        fn DwmSetWindowAttribute(
            hwnd: isize,
            attribute: u32,
            value: *const c_void,
            value_size: u32,
        ) -> i32;
    }

    /// Opts the frameless window into Windows 11 DWM-managed rounded corners.
    ///
    /// Corner radius is owned by the compositor and scales with DPI automatically.
    /// There is no supported API to read the exact pixel radius.
    pub fn apply_round_corners(window: &WebviewWindow) {
        let Ok(hwnd) = window.hwnd() else {
            return;
        };

        let preference = DWMWCP_ROUND;
        let result = unsafe {
            DwmSetWindowAttribute(
                hwnd.0 as isize,
                DWMWA_WINDOW_CORNER_PREFERENCE,
                &preference as *const u32 as *const c_void,
                std::mem::size_of::<u32>() as u32,
            )
        };

        if result != S_OK {
            log::warn!("DwmSetWindowAttribute(DWMWA_WINDOW_CORNER_PREFERENCE) failed: {result}");
        }
    }
}
