import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Paperclip,
  Plus,
  Users,
  UserPlus,
} from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { FadeSlideIn, PressableScale } from '@/components/motion';
import {
  Button,
  Card,
  Field,
  RadioRow,
  Screen,
  SectionTitle,
} from '@/components/ui';
import { reportError } from '@/lib/alerts';
import { uploadReceipt } from '@/lib/repository';
import { isSupabaseConfigured } from '@/lib/supabase';
import type { RootStackParamList } from '@/navigation/types';
import { useLedger } from '@/store/LedgerProvider';
import { usePalette } from '@/store/ThemeProvider';
import type { TransactionDirection } from '@/types';
import { DEFAULT_CURRENCY, formatDate, getNetTheme } from '@/utils/ledger';

type Navigation = NativeStackNavigationProp<RootStackParamList>;
type AddRoute = RouteProp<RootStackParamList, 'AddTransaction'>;

/** شاشة إضافة حركة: تحديد الاتجاه، جهة الاتصال، المناسبة، والمبلغ. */
export function AddTransactionScreen() {
  const navigation = useNavigation<Navigation>();
  const { params } = useRoute<AddRoute>();
  const { contacts, events, addTransaction } = useLedger();
  const palette = usePalette();

  const [direction, setDirection] = useState<TransactionDirection>('OUT');
  const [contactId, setContactId] = useState<string | null>(
    params?.contactId ?? null,
  );
  const [eventId, setEventId] = useState<string | null>(params?.eventId ?? null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [receiptUri, setReceiptUri] = useState<string | null>(
    params?.prefill?.receiptUri ?? null,
  );

  // العودة من شاشة الإنشاء تمرّ عبر تحديث المعاملات، لا عبر إعادة التركيب،
  // لذا نزامن الاختيار يدوياً. نتجاهل القيم الفارغة حتى لا يُمسح اختيار قائم.
  const paramContactId = params?.contactId;
  const paramEventId = params?.eventId;

  useEffect(() => {
    if (paramContactId) setContactId(paramContactId);
  }, [paramContactId]);

  useEffect(() => {
    if (paramEventId) setEventId(paramEventId);
  }, [paramEventId]);

  // قيم مقترحة من الإدخال الذكي أو قارئ الإيصالات: تُملأ للمراجعة فقط.
  const prefill = params?.prefill;
  useEffect(() => {
    if (!prefill) return;
    if (prefill.amount !== undefined) setAmount(String(prefill.amount));
    if (prefill.direction) setDirection(prefill.direction);
    if (prefill.note) setNote(prefill.note);
    if (prefill.receiptUri) setReceiptUri(prefill.receiptUri);
  }, [prefill]);

  const sortedContacts = useMemo(
    () =>
      [...contacts].sort((a, b) => a.full_name.localeCompare(b.full_name, 'ar')),
    [contacts],
  );

  const parsedAmount = Number(amount.replace(',', '.'));
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount > 0;
  const isValid = contactId !== null && amountValid;

  /** معاينة أثر الحركة على الصافي: OUT يزيده، IN ينقصه. */
  const previewTheme = getNetTheme(direction === 'OUT' ? 1 : -1);

  /**
   * مصروف المناسبة يُقسَّم على أعضائها، وهو مسار مختلف عن حركة شخصية
   * واحدة: ننقل ما كُتب إلى شاشة المصروف الجماعي بدل تكرار منطق القسمة
   * هنا. رفع الإيصال يبقى كما هو في كلا المسارين.
   */
  function continueAsSharedExpense() {
    if (!eventId) return;
    navigation.navigate('AddSharedExpense', {
      eventId,
      prefill: {
        description: note.trim() || undefined,
        amount: amountValid ? parsedAmount : undefined,
        receiptUri: receiptUri ?? undefined,
      },
    });
  }

  async function handleSave() {
    if (!isValid || !contactId) return;
    setSaving(true);
    try {
      // الرفع قبل الإدراج: حركة تشير إلى إيصال غير موجود أسوأ من حركة
      // بلا إيصال، لذا يفشل الحفظ كله إن فشل الرفع.
      let receiptPath: string | null = null;
      if (receiptUri && isSupabaseConfigured) {
        receiptPath = await uploadReceipt(receiptUri);
      }

      await addTransaction({
        contact_id: contactId,
        event_id: eventId,
        direction,
        amount: parsedAmount,
        currency: DEFAULT_CURRENCY,
        note: note.trim() || null,
        receipt_url: receiptPath,
      });
      navigation.goBack();
    } catch (error) {
      reportError('تعذّر الحفظ', error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen
      footer={
        <Button
          title="حفظ الحركة"
          onPress={() => void handleSave()}
          disabled={!isValid}
          loading={saving}
          size="lg"
        />
      }>
      <FadeSlideIn index={0}>
        <SectionTitle>نوع الحركة</SectionTitle>
        <View className="flex-row-reverse">
          <DirectionOption
            active={direction === 'OUT'}
            label="دفعت نقوط"
            hint="واجب لي عند غيري"
            icon={
              <ArrowUpRight
                size={18}
                color={direction === 'OUT' ? '#FFFFFF' : palette.success}
              />
            }
            activeClass="bg-success border-success"
            onPress={() => setDirection('OUT')}
          />
          <View className="w-3" />
          <DirectionOption
            active={direction === 'IN'}
            label="استلمت نقوط"
            hint="واجب عليّ"
            icon={
              <ArrowDownLeft
                size={18}
                color={direction === 'IN' ? '#FFFFFF' : palette.danger}
              />
            }
            activeClass="bg-danger border-danger"
            onPress={() => setDirection('IN')}
          />
        </View>
      </FadeSlideIn>

      <FadeSlideIn index={1} className="mt-6">
        <Field
          label="المبلغ"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0"
          emphasis
          inputClassName={previewTheme.textClass}
          hint={
            direction === 'OUT'
              ? 'يزيد ما لك عند هذا الشخص.'
              : 'يزيد ما عليك لهذا الشخص.'
          }
        />
      </FadeSlideIn>

      <FadeSlideIn index={2} className="mt-6">
        <SectionTitle
          action={
            <PillAction
              label="جديدة"
              icon={<UserPlus size={14} color={palette.primary} />}
              onPress={() =>
                navigation.navigate('AddContact', { returnTo: 'AddTransaction' })
              }
            />
          }>
          جهة الاتصال
        </SectionTitle>

        <Card variant="surface" padded={false} animate={false} className="p-2">
          {sortedContacts.length === 0 ? (
            <View className="items-center p-4">
              <Text className="text-center text-body text-ink">
                لا توجد جهات اتصال بعد.
              </Text>
              <Text className="mt-1 text-center text-caption text-ink-muted">
                أضف جهة اتصال أولاً لتتمكن من تسجيل حركة.
              </Text>
              <Button
                title="إضافة جهة اتصال"
                size="sm"
                block={false}
                className="mt-3"
                onPress={() =>
                  navigation.navigate('AddContact', {
                    returnTo: 'AddTransaction',
                  })
                }
              />
            </View>
          ) : (
            sortedContacts.map((contact) => (
              <RadioRow
                key={contact.id}
                label={contact.full_name}
                selected={contactId === contact.id}
                onSelect={() => setContactId(contact.id)}
              />
            ))
          )}
        </Card>
      </FadeSlideIn>

      <FadeSlideIn index={3} className="mt-6">
        <SectionTitle
          action={
            <PillAction
              label="جديدة"
              icon={<Plus size={14} color={palette.primary} />}
              onPress={() =>
                navigation.navigate('AddEvent', {
                  returnTo: 'AddTransaction',
                  hostContactId: contactId ?? undefined,
                })
              }
            />
          }>
          المناسبة (اختياري)
        </SectionTitle>

        <Card variant="surface" padded={false} animate={false} className="p-2">
          <RadioRow
            label="بدون مناسبة"
            selected={eventId === null}
            onSelect={() => setEventId(null)}
          />
          {events.map((event) => (
            <RadioRow
              key={event.id}
              label={event.title}
              caption={formatDate(event.event_date)}
              selected={eventId === event.id}
              onSelect={() => setEventId(event.id)}
            />
          ))}
        </Card>
      </FadeSlideIn>

      <FadeSlideIn index={4} className="mt-6">
        <Field
          label="ملاحظة (اختياري)"
          value={note}
          onChangeText={setNote}
          placeholder="مثال: نقوط فرح أخيه"
        />
      </FadeSlideIn>

      {eventId ? (
        <FadeSlideIn index={5} className="mt-4">
          {/* مسار المصروف المشترك: بنفسجي، هوية المناسبات في التطبيق. */}
          <Card variant="secondary" animate={false}>
            <View className="flex-row-reverse items-center">
              <Users size={16} color={palette.secondary} />
              <Text className="mr-2 text-right text-body font-bold text-ink">
                مصروف مشترك؟
              </Text>
            </View>
            <Text className="mt-1 text-right text-caption text-ink-muted">
              اختر من يشارك في هذا المصروف تحديداً، ويُقسَّم المبلغ على
              المحدّدين وحدهم. المستبعدون لا يتحمّلون شيئاً منه.
            </Text>
            <Button
              title="متابعة كمصروف مشترك"
              variant="secondary"
              size="sm"
              className="mt-3"
              onPress={continueAsSharedExpense}
            />
            <Text className="mt-2 text-center text-caption text-ink-muted">
              أو تابع بالأسفل لتسجيلها حركة شخصية عادية.
            </Text>
          </Card>
        </FadeSlideIn>
      ) : null}

      {receiptUri ? (
        <FadeSlideIn index={6} className="mt-6">
          <Card variant="primary" animate={false} padded={false}>
            <View className="flex-row-reverse items-center p-3">
              <Paperclip size={16} color={palette.primary} />
              <Text className="mr-2 flex-1 text-right text-caption text-ink">
                {isSupabaseConfigured
                  ? 'إيصال مرفق — يُرفع عند الحفظ.'
                  : 'إيصال مرفق — يحتاج Supabase ليُرفع.'}
              </Text>
              <Button
                title="إزالة"
                variant="ghost"
                size="sm"
                block={false}
                onPress={() => setReceiptUri(null)}
              />
            </View>
          </Card>
        </FadeSlideIn>
      ) : null}
    </Screen>
  );
}

interface DirectionOptionProps {
  active: boolean;
  label: string;
  hint: string;
  icon: React.ReactNode;
  activeClass: string;
  onPress: () => void;
}

/** خيار الاتجاه: بطاقة كبيرة تلوّن بدلالة الحركة عند اختيارها. */
function DirectionOption({
  active,
  label,
  hint,
  icon,
  activeClass,
  onPress,
}: DirectionOptionProps) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label} — ${hint}`}
      activeScale={0.965}
      className={`flex-1 items-center rounded-card border p-3 ${
        active ? activeClass : 'border-line bg-surface'
      }`}>
      {icon}
      <Text
        className={`mt-1 text-body font-bold ${
          active ? 'text-white' : 'text-ink'
        }`}>
        {label}
      </Text>
      <Text
        className={`text-caption ${active ? 'text-white/85' : 'text-ink-muted'}`}>
        {hint}
      </Text>
    </PressableScale>
  );
}

/** زرّ صغير بجوار عنوان القسم: "جديدة". */
function PillAction({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      activeScale={0.94}
      className="flex-row-reverse items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1">
      {icon}
      <Text className="mr-1 text-caption font-bold text-primary">{label}</Text>
    </PressableScale>
  );
}
