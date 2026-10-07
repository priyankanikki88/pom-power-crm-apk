import { useState } from 'react';
import { View } from 'react-native';
import { space } from '../theme';
import { Button, Field } from './ui';

/**
 * A button for an action the server wants a written reason for (put on hold, cancel, …): the first tap opens a reason box,
 * the second sends it. The reason is always the user's own words — the app never fills one in.
 */
export function ReasonAction({ title, label, confirmTitle, danger, busy, disabled, onSubmit }: { title: string; label: string; confirmTitle: string; danger?: boolean; busy?: boolean; disabled?: boolean; onSubmit: (reason: string) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  if (!open) return <Button title={title} variant="secondary" disabled={disabled} onPress={() => setOpen(true)} />;
  return (
    <View>
      <Field label={`${label} *`} value={reason} onChangeText={setReason} multiline maxLength={1000} />
      <Button title={confirmTitle} variant={danger ? 'danger' : 'primary'} loading={busy} disabled={disabled || reason.trim().length < 3} onPress={() => onSubmit(reason.trim())} />
      <View style={{ height: space.sm }} />
      <Button title="Back" variant="secondary" onPress={() => setOpen(false)} />
    </View>
  );
}
