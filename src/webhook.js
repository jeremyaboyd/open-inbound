async function fireWebhook(webhookUrl, emailData, attachments = []) {
  const payload = {
    ...emailData,
    attachments
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`Webhook returned non-OK status: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('Webhook request timed out after 10s');
    } else {
      console.error('Webhook error (fire and forget):', error.message);
    }
  }
}

module.exports = { fireWebhook };
