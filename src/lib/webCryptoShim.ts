import * as Crypto from 'expo-crypto';

/**
 * سدّ بسيط لـ crypto.subtle.digest على React Native.
 *
 * تدفّق PKCE في supabase-js يحسب تحدّي SHA-256 عبر WebCrypto. محرّك
 * Hermes لا يوفّر crypto.subtle، فيتراجع supabase-js تلقائياً إلى أسلوب
 * "plain" — أي أن التحدّي يساوي المُتحقِّق، وهو أضعف حماية أمام تطبيق
 * آخر يسجّل نفس مخطط الروابط ويعترض إعادة التوجيه.
 *
 * نوفّر هنا digest حقيقياً من expo-crypto لنبقى على s256. السدّ محصور:
 * لا يعمل إلا إذا كان subtle غائباً، ولا يدعم إلا SHA-256 — وأي فشل
 * يترك supabase-js يستخدم تراجعه المعتاد.
 */

type GlobalWithCrypto = typeof globalThis & {
  crypto?: Partial<Crypto> & {
    subtle?: { digest?: unknown };
  };
};

function hexToArrayBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes.buffer;
}

export function installWebCryptoShim(): void {
  const globalObject = globalThis as GlobalWithCrypto;

  if (!globalObject.crypto) {
    // @ts-expect-error نُنشئ الكائن الناقص فقط عند غيابه تماماً.
    globalObject.crypto = {};
  }

  const cryptoObject = globalObject.crypto;
  if (!cryptoObject) return;

  // موجود أصلاً (الويب): لا نلمسه.
  if (cryptoObject.subtle && typeof cryptoObject.subtle.digest === 'function') {
    return;
  }

  const digest = async (
    algorithm: string | { name: string },
    data: BufferSource,
  ): Promise<ArrayBuffer> => {
    const name = typeof algorithm === 'string' ? algorithm : algorithm.name;
    if (name.toUpperCase() !== 'SHA-256') {
      throw new Error(`webCryptoShim: خوارزمية غير مدعومة (${name}).`);
    }

    const bytes =
      data instanceof Uint8Array
        ? data
        : new Uint8Array(
            data instanceof ArrayBuffer ? data : (data as ArrayBufferView).buffer,
          );

    // المُتحقِّق في PKCE نص ASCII، فالتحويل إلى نص آمن هنا.
    let text = '';
    for (const byte of bytes) text += String.fromCharCode(byte);

    const hex = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      text,
      { encoding: Crypto.CryptoEncoding.HEX },
    );

    return hexToArrayBuffer(hex);
  };

  Object.defineProperty(cryptoObject, 'subtle', {
    value: { digest },
    configurable: true,
  });
}
