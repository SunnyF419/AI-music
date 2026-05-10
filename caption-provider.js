window.captionProvider = {
  async transcribe(track) {
    const apiUrl = window.CAPTION_API_URL || "/api/transcribe";

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: track.id,
        title: track.title,
        artist: track.artist,
        src: new URL(track.src, window.location.href).href
      })
    });

    if (!response.ok) {
      let message = `Caption API returned ${response.status}.`;
      try {
        const data = await response.json();
        message = data.error || message;
      } catch {
        // Keep the status-based message when the response is not JSON.
      }
      throw new Error(message);
    }

    const data = await response.json();
    if (!Array.isArray(data.lyrics)) {
      throw new Error("Caption API response must include a lyrics array.");
    }

    return data.lyrics;
  }
};
