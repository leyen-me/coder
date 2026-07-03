use lettre::message::header::ContentType;
use lettre::transport::smtp::authentication::Credentials;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};
use serde::Deserialize;

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmailSettings {
    pub smtp_host: String,
    pub smtp_port: u16,
    pub username: String,
    pub password: String,
    pub from_address: String,
    pub use_tls: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendEmailRequest {
    pub settings: EmailSettings,
    pub to: String,
    pub subject: String,
    pub body: String,
}

// ---------------------------------------------------------------------------
// Tauri command
// ---------------------------------------------------------------------------

/// Send an email via SMTP using the lettre crate.
pub async fn send_email(request: SendEmailRequest) -> Result<String, String> {
    let settings = &request.settings;

    let email = Message::builder()
        .from(
            settings
                .from_address
                .parse()
                .map_err(|e: lettre::address::AddressError| format!("Invalid from address: {e}"))?,
        )
        .to(request
            .to
            .parse()
            .map_err(|e: lettre::address::AddressError| format!("Invalid to address: {e}"))?)
        .subject(&request.subject)
        .header(ContentType::TEXT_PLAIN)
        .body(request.body)
        .map_err(|e| format!("Failed to build email: {e}"))?;

    let creds = Credentials::new(settings.username.clone(), settings.password.clone());

    // Build transport: TLS on port 465, STARTTLS on 587/25
    let mailer = if settings.use_tls || settings.smtp_port == 465 {
        AsyncSmtpTransport::<Tokio1Executor>::relay(&settings.smtp_host)
            .map_err(|e| format!("Failed to create SMTP transport: {e}"))?
            .port(settings.smtp_port)
            .credentials(creds)
            .build()
    } else {
        AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&settings.smtp_host)
            .map_err(|e| format!("Failed to create SMTP transport: {e}"))?
            .port(settings.smtp_port)
            .credentials(creds)
            .build()
    };

    match mailer.send(email).await {
        Ok(response) => {
            let msg: String = response.message().collect();
            if msg.trim().is_empty() {
                Ok("✅ Email sent successfully".to_string())
            } else {
                Ok(format!("✅ Email sent: {}", msg.trim()))
            }
        }
        Err(e) => Err(format!("Failed to send email: {e}")),
    }
}
