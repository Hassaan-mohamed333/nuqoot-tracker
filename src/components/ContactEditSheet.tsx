import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, Field, Sheet } from '@/components/ui';
import { reportError } from '@/lib/alerts';
import type { ContactPatch } from '@/lib/validateEntities';
import type { Contact } from '@/types';

interface ContactEditSheetProps {
  /** جهة الاتصال المطلوب تعديلها؛ `null` يُبقي الورقة مغلقة. */
  contact: Contact | null;
  onClose: () => void;
  onSave: (contactId: string, updates: ContactPatch) => Promise<unknown>;
}

/** ورقة تعديل جهة اتصال: الاسم، الهاتف، صلة القرابة، الملاحظات. */
export function ContactEditSheet({
  contact,
  onClose,
  onSave,
}: ContactEditSheetProps) {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [relation, setRelation] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!contact) return;
    setFullName(contact.full_name);
    setPhone(contact.phone ?? '');
    setRelation(contact.relation ?? '');
    setNotes(contact.notes ?? '');
  }, [contact]);

  const nameValid = fullName.trim().length >= 2;

  async function handleSave() {
    if (!contact || !nameValid || saving) return;

    const updates: ContactPatch = {};
    const nextName = fullName.trim();
    if (nextName !== contact.full_name) updates.full_name = nextName;

    const nextPhone = phone.trim() || null;
    if (nextPhone !== (contact.phone ?? null)) updates.phone = nextPhone;

    const nextRelation = relation.trim() || null;
    if (nextRelation !== (contact.relation ?? null)) {
      updates.relation = nextRelation;
    }

    const nextNotes = notes.trim() || null;
    if (nextNotes !== (contact.notes ?? null)) updates.notes = nextNotes;

    if (Object.keys(updates).length === 0) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      await onSave(contact.id, updates);
      onClose();
    } catch (error) {
      reportError('تعذّر حفظ التعديل', error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      visible={contact !== null}
      onClose={onClose}
      title="تعديل جهة الاتصال"
      dismissable={!saving}>
      <Field
        label="الاسم"
        value={fullName}
        onChangeText={setFullName}
        error={
          fullName.length > 0 && !nameValid ? 'الاسم حرفان على الأقل.' : null
        }
      />
      <Field
        label="رقم الهاتف"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        placeholder="اختياري"
        className="mt-4"
      />
      <Field
        label="صلة القرابة"
        value={relation}
        onChangeText={setRelation}
        placeholder="اختياري"
        className="mt-4"
      />
      <Field
        label="ملاحظات"
        value={notes}
        onChangeText={setNotes}
        placeholder="اختياري"
        multiline
        className="mt-4"
      />

      <View className="mt-5 flex-row-reverse">
        <Button
          title="حفظ"
          onPress={() => void handleSave()}
          disabled={!nameValid}
          loading={saving}
          block={false}
          className="flex-1"
        />
        <View className="w-3" />
        <Button
          title="إلغاء"
          variant="outline"
          onPress={onClose}
          disabled={saving}
          block={false}
          className="flex-1"
        />
      </View>
    </Sheet>
  );
}
