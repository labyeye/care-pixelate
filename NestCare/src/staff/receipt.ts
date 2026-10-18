// Booking receipt as shareable text (WhatsApp / SMS / email / "save to files" via the OS share sheet).
import { Share } from 'react-native';
import { fmtDate, fmtTime, money, personName } from './ui';

export const receiptNumber = (a: {
  _id: string;
  createdAt?: string;
  scheduledAt: string;
}) =>
  `BKG-${new Date(a.createdAt ?? a.scheduledAt).toISOString().slice(0, 10).replace(/-/g, '')}-${a._id.slice(-5).toUpperCase()}`;

export function receiptText(a: any, tenant: any): string {
  const status = a.paymentStatus ?? 'unpaid';
  const pay =
    status === 'paid'
      ? `Paid${a.payment?.paidAt ? ' on ' + fmtDate(a.payment.paidAt) : ''}${a.payment?.paymentId ? ' (Ref ' + a.payment.paymentId + ')' : ''}`
      : status === 'waived'
        ? 'Waived'
        : 'Payable at the clinic';
  const doctor = personName(a.doctorId);
  const spec = (a.doctorId?.professionalDetails?.specializations ?? []).join(
    ', ',
  );
  const lines = [
    `${tenant?.gstDetails?.legalName || tenant?.name || 'Clinic'}`,
    [tenant?.contact?.address, tenant?.contact?.city]
      .filter(Boolean)
      .join(', '),
    tenant?.contact?.phone ? `Phone: ${tenant.contact.phone}` : '',
    '',
    'APPOINTMENT BOOKING RECEIPT',
    `Receipt no: ${receiptNumber(a)}`,
    `Booked on: ${fmtDate(a.createdAt ?? a.scheduledAt)}`,
    '',
    `Patient: ${personName(a.patientId) || '—'}${a.patientId?.patientId ? ` (${a.patientId.patientId})` : ''}`,
    `Doctor: ${doctor ? 'Dr. ' + doctor.replace(/^Dr\.?\s+/i, '') : '—'}${spec ? ` — ${spec}` : ''}`,
    `Date: ${fmtDate(a.scheduledAt)}  Time: ${fmtTime(a.scheduledAt)}`,
    `Visit: ${a.type === 'video' ? 'Video consultation' : a.type === 'walk_in' ? 'Walk-in' : 'In-clinic'}`,
    a.tokenNo ? `Token: ${a.tokenNo}` : '',
    a.reason ? `Reason: ${a.reason}` : '',
    '',
    `Consultation fee: ${a.fee ? money(a.fee) : '—'}  (${pay})`,
    `Status: ${(a.status || '').replace('_', ' ').toUpperCase()}`,
    '',
    'Please arrive 10 minutes early and carry this receipt with a photo ID.',
  ];
  return lines
    .filter((l, i) => l !== '' || lines[i - 1] !== '')
    .filter(l => l !== undefined)
    .join('\n');
}

export const shareReceipt = (a: any, tenant: any) =>
  Share.share({
    title: `Booking receipt ${receiptNumber(a)}`,
    message: receiptText(a, tenant),
  });
