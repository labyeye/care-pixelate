// Staff-side API: the same endpoints the NestCare web app uses, called with the Bearer token.
import { request } from '../services/api';

type Res<T> = { success: boolean; data: T; count?: number; total?: number; message?: string };

const q = (params: Record<string, string | number | undefined | null> = {}) => {
  const e = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return e.length ? '?' + e.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&') : '';
};
const body = (b: unknown) => JSON.stringify(b);
const get = async <T = any>(path: string, params?: Record<string, any>) => (await request<Res<T>>(path + q(params))).data;
const send = async <T = any>(method: string, path: string, b?: unknown) =>
  (await request<Res<T>>(path, { method, body: b === undefined ? undefined : body(b) })).data;
const crud = (path: string) => ({
  list: (p?: Record<string, any>) => get<any[]>(path, { limit: 200, ...p }),
  one: (id: string) => get<any>(`${path}/${id}`),
  create: (b: unknown) => send<any>('POST', path, b),
  update: (id: string, b: unknown) => send<any>('PUT', `${path}/${id}`, b),
  remove: (id: string) => send<any>('DELETE', `${path}/${id}`),
});

export const api = {
  summary: () => get<any>('/summary'),
  analytics: (from: string, to: string) => get<any>('/analytics/summary', { from, to }),
  patients: crud('/patients'),
  doctors: crud('/doctors'),
  slots: (doctorId: string, date: string) => get<{ start: string; end: string }[]>(`/doctors/${doctorId}/slots`, { date }),
  appointments: {
    ...crud('/appointments'),
    range: (from: string, to: string, doctorId?: string) => get<any[]>('/appointments', { from, to, doctorId, limit: 500 }),
    checkIn: (id: string) => send<any>('POST', `/appointments/${id}/check-in`),
    videoLink: (id: string) => get<{ url: string }>(`/appointments/${id}/video-link`),
  },
  consultations: {
    list: (p?: Record<string, any>) => get<any[]>('/consultations', p),
    one: (id: string) => get<any>(`/consultations/${id}`),
    create: (b: unknown) => send<any>('POST', '/consultations', b),
    update: (id: string, b: unknown) => send<any>('PUT', `/consultations/${id}`, b),
    sign: (id: string) => send<any>('POST', `/consultations/${id}/sign`),
    discard: (id: string) => send<any>('DELETE', `/consultations/${id}`),
  },
  lab: {
    list: (p?: Record<string, any>) => get<any[]>('/lab-orders', p),
    technicians: () => get<any[]>('/lab-orders/technicians'),
    create: (b: unknown) => send<any>('POST', '/lab-orders', b),
    update: (id: string, b: unknown) => send<any>('PUT', `/lab-orders/${id}`, b),
  },
  medicines: {
    list: (p?: Record<string, any>) => get<any[]>('/medicines', { limit: 200, ...p }),
    stats: () => get<any>('/medicines/stats'),
    create: (b: unknown) => send<any>('POST', '/medicines', b),
    update: (id: string, b: unknown) => send<any>('PUT', `/medicines/${id}`, b),
    stock: (id: string, b: { type: 'in' | 'out' | 'set'; qty: number; expiryDate?: string }) => send<any>('POST', `/medicines/${id}/stock`, b),
    remove: (id: string) => send<any>('DELETE', `/medicines/${id}`),
  },
  vendors: {
    list: (p?: Record<string, any>) => get<any[]>('/vendors', { limit: 200, ...p }),
    stats: () => get<any>('/vendors/stats'),
    create: (b: unknown) => send<any>('POST', '/vendors', b),
    update: (id: string, b: unknown) => send<any>('PUT', `/vendors/${id}`, b),
    remove: (id: string) => send<any>('DELETE', `/vendors/${id}`),
  },
  invoices: {
    list: (p?: Record<string, any>) => get<any[]>('/invoices', p),
    one: (id: string) => get<any>(`/invoices/${id}`),
    create: (b: unknown) => send<any>('POST', '/invoices', b),
    fromAppointment: (id: string) => send<any>('POST', `/invoices/from-appointment/${id}`),
    pay: (id: string, b: { amount: number; mode: string; reference?: string }) => send<any>('POST', `/invoices/${id}/payments`, b),
    void: (id: string, reason?: string) => send<any>('POST', `/invoices/${id}/void`, { reason }),
    catalog: (qs: string) => get<any[]>('/invoices/catalog', { q: qs }),
  },
  staff: {
    list: () => get<any[]>('/staff'),
    create: (b: unknown) => send<any>('POST', '/staff', b),
    update: (id: string, b: unknown) => send<any>('PUT', `/staff/${id}`, b),
    remove: (id: string) => send<any>('DELETE', `/staff/${id}`),
    resetPassword: (id: string, password?: string) => send<{ password: string; email: string; name: string }>('POST', `/staff/${id}/reset-password`, { password }),
  },
  forgotPassword: (email: string) => send<any>('POST', '/auth/forgot-password', { email }),
  locations: {
    list: () => get<any[]>('/clinics'),
    create: (b: unknown) => send<any>('POST', '/clinics', b),
    update: (id: string, b: unknown) => send<any>('PUT', `/clinics/${id}`, b),
    remove: (id: string) => send<any>('DELETE', `/clinics/${id}`),
  },
  audit: (p?: Record<string, any>) => get<any[]>('/audit-logs', { limit: 100, ...p }),
  reports: {
    list: () => get<any[]>('/reports'),
    run: (type: string, p?: Record<string, any>) => get<any>(`/reports/${type}`, p),
  },
  billing: {
    plans: () => get<any>('/billing/plans'),
    me: () => get<any>('/billing/me'),
  },
  tenant: {
    me: () => get<any>('/tenants/me'),
    update: (b: unknown) => send<any>('PUT', '/tenants/me', b),
  },
};
