import { ShieldCheck } from 'lucide-react-native';
import React, { useReducer, useState } from 'react';
import { Text, View } from 'react-native';

import { PressableScale } from '@/components/motion';
import { Button, Field, Sheet } from '@/components/ui';
import { logger } from '@/lib/logger';
import { palette } from '@/lib/palette';
import {
  COUNTRY_CODES,
  DEFAULT_COUNTRY,
  INITIAL_LINK_STATE,
  OTP_LENGTH,
  checkOtp,
  confirmPhoneLink,
  formatPhone,
  linkReducer,
  requestPhoneLink,
  toE164,
} from '@/lib/phoneAuth';
import { userMessage } from '@/lib/supabaseError';

interface PhoneLinkSheetProps {
  visible: boolean;
  onClose: () => void;
  /** الرقم الموثَّق حالياً، إن وُجد. */
  currentPhone: string | null;
  onLinked: (phone: string) => void;
}

/**
 * ربط رقم الهاتف: الرقم، ثم رمز الرسالة.
 *
 * خطوتان في ورقة واحدة لا شاشتين: الرمز يصل في ثوانٍ، والانتقال بين
 * شاشتين في تلك اللحظة يفقد المستخدم موضعه.
 */
export function PhoneLinkSheet({
  visible,
  onClose,
  currentPhone,
  onLinked,
}: PhoneLinkSheetProps) {
  const [state, dispatch] = useReducer(linkReducer, INITIAL_LINK_STATE);
  const [countryIso, setCountryIso] = useState(DEFAULT_COUNTRY.iso);
  const [national, setNational] = useState('');
  const [code, setCode] = useState('');

  const busy = state.stage === 'sending' || state.stage === 'verifying';

  function close() {
    if (busy) return;
    dispatch({ type: 'reset' });
    setNational('');
    setCode('');
    onClose();
  }

  async function send() {
    const parsed = toE164(countryIso, national);
    if (!parsed.ok) {
      dispatch({ type: 'failed', message: parsed.message });
      return;
    }

    dispatch({ type: 'send', phone: parsed.value });
    try {
      await requestPhoneLink(parsed.value);
      dispatch({ type: 'sent' });
    } catch (error) {
      logger.error('phone', 'فشل إرسال الرمز', error);
      dispatch({ type: 'failed', message: userMessage(error) });
    }
  }

  async function verify() {
    const parsed = checkOtp(code);
    if (!parsed.ok) {
      dispatch({ type: 'failed', message: parsed.message });
      return;
    }
    if (!state.pendingPhone) return;

    dispatch({ type: 'submit' });
    try {
      await confirmPhoneLink(state.pendingPhone, parsed.value);
      dispatch({ type: 'verified' });
      onLinked(state.pendingPhone);
    } catch (error) {
      logger.error('phone', 'فشل تأكيد الرمز', error);
      dispatch({ type: 'failed', message: userMessage(error) });
    }
  }

  const awaitingCode =
    state.stage === 'awaiting-code' || state.stage === 'verifying';

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title={awaitingCode ? 'رمز التحقّق' : 'ربط رقم الهاتف'}
      dismissable={!busy}>
      {state.stage === 'linked' ? (
        <View className="items-center py-4">
          <ShieldCheck size={36} color={palette.success} />
          <Text className="mt-3 text-center text-base font-bold text-ink">
            تمّ ربط الرقم
          </Text>
          <Text className="mt-1 text-center text-sm text-ink-muted">
            {formatPhone(state.pendingPhone ?? '')}
          </Text>
          <Button title="تمّ" onPress={close} className="mt-5" />
        </View>
      ) : awaitingCode ? (
        <>
          <Text className="text-right text-sm text-ink-muted">
            أرسلنا رمزاً من {OTP_LENGTH} أرقام إلى{' '}
            {formatPhone(state.pendingPhone ?? '')}.
          </Text>

          <Field
            label="الرمز"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={OTP_LENGTH}
            emphasis
            className="mt-4"
            accessibilityLabel="رمز التحقّق"
          />

          {state.error ? (
            <Text className="mt-2 text-right text-caption text-danger">
              {state.error}
            </Text>
          ) : null}

          <Button
            title="تأكيد"
            onPress={() => void verify()}
            loading={state.stage === 'verifying'}
            className="mt-5"
          />
          <PressableScale
            onPress={() => void send()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="إعادة إرسال الرمز"
            activeScale={0.97}
            className="mt-3 items-center py-2">
            <Text className="text-xs font-bold text-primary">
              لم يصلك الرمز؟ أعد الإرسال
            </Text>
          </PressableScale>
        </>
      ) : (
        <>
          {currentPhone ? (
            <Text className="mb-3 text-right text-sm text-ink-muted">
              الرقم الحالي: {formatPhone(currentPhone)}. الربط الجديد يستبدله.
            </Text>
          ) : null}

          <Text className="mb-2 text-right text-sm font-bold text-ink">
            الدولة
          </Text>
          <View className="flex-row-reverse flex-wrap">
            {COUNTRY_CODES.map((country) => {
              const active = country.iso === countryIso;
              return (
                <PressableScale
                  key={country.iso}
                  onPress={() => setCountryIso(country.iso)}
                  accessibilityRole="button"
                  accessibilityLabel={`${country.label} ${country.dial}`}
                  accessibilityState={{ selected: active }}
                  activeScale={0.95}
                  className={`mb-2 ml-2 rounded-full px-3 py-1.5 ${
                    active ? 'bg-primary' : 'border border-line bg-surface'
                  }`}>
                  <Text
                    className={`text-xs font-bold ${
                      active ? 'text-primary-fg' : 'text-ink-muted'
                    }`}>
                    {country.label} {country.dial}
                  </Text>
                </PressableScale>
              );
            })}
          </View>

          <Field
            label="رقم الهاتف"
            value={national}
            onChangeText={setNational}
            keyboardType="phone-pad"
            placeholder="01012345678"
            className="mt-2"
            accessibilityLabel="رقم الهاتف"
            hint="اكتبه كما تكتبه في هاتفك؛ صفر البداية يُحذف تلقائياً."
          />

          {state.error ? (
            <Text className="mt-2 text-right text-caption text-danger">
              {state.error}
            </Text>
          ) : null}

          <Button
            title="إرسال الرمز"
            onPress={() => void send()}
            loading={state.stage === 'sending'}
            className="mt-5"
          />
        </>
      )}
    </Sheet>
  );
}
