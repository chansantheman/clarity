const REFERENCE_HEADER = 'X-Pronunciation-Reference';
// 28 seconds of 16 kHz, 16-bit mono PCM plus a WAV header (services/scoring.ts:17).
const MAX_AUDIO_BYTES = 1_000_000;
// UNVERIFIED: the hosting provider's effective request-header limit.
const MAX_REFERENCE_BYTES = 8_000;

function decodeBase64Utf8(value: string): string | null {
  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function encodeBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function azureUrl(region: string): string {
  return `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US&format=detailed`;
}

export async function POST(request: Request) {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) {
    return Response.json({ error: 'Pronunciation assessment is unavailable.' }, { status: 503 });
  }

  const encodedReference = request.headers.get(REFERENCE_HEADER);
  if (!encodedReference || encodedReference.length > MAX_REFERENCE_BYTES) {
    return Response.json({ error: 'Invalid pronunciation reference.' }, { status: 400 });
  }

  const referenceText = decodeBase64Utf8(encodedReference);
  if (!referenceText) {
    return Response.json({ error: 'Invalid pronunciation reference.' }, { status: 400 });
  }

  const audio = await request.arrayBuffer();
  if (audio.byteLength === 0 || audio.byteLength > MAX_AUDIO_BYTES) {
    return Response.json({ error: 'Invalid pronunciation audio.' }, { status: 400 });
  }

  const assessmentParams = encodeBase64Utf8(
    JSON.stringify({
      ReferenceText: referenceText,
      GradingSystem: 'HundredMark',
      Granularity: 'Word',
      Dimension: 'Comprehensive',
      EnableMiscue: 'True',
      EnableProsodyAssessment: 'True',
    }),
  );

  try {
    const response = await fetch(azureUrl(region), {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
        'Pronunciation-Assessment': assessmentParams,
        Accept: 'application/json',
      },
      body: audio,
    });

    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: { 'Content-Type': response.headers.get('Content-Type') ?? 'application/json' },
    });
  } catch (error) {
    console.error(
      '[pronunciation-assessment] Azure request failed:',
      error instanceof Error ? error.message : error,
    );
    return Response.json({ error: 'Pronunciation assessment is unavailable.' }, { status: 502 });
  }
}
