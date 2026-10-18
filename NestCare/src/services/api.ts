import storage from '../utils/storage';

// Android emulator → host machine's localhost via the 10.0.2.2 loopback alias.
// iOS simulator shares the Mac's network namespace, so use localhost there instead:
//   const API_BASE = 'http://localhost:5050/api';
export const API_BASE = 'http://10.0.2.2:5050/api';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

async function getToken(): Promise<string | null> {
  return storage.getItem('token');
}

export async function setToken(token: string): Promise<void> {
  await storage.setItem('token', token);
}

export async function removeToken(): Promise<void> {
  await storage.removeItem('token');
  await storage.removeItem('user');
}

export async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  let data: any = {};
  try {
    const text = await response.text();
    if (text) data = JSON.parse(text);
  } catch {
    /* ignore malformed body */
  }

  if (!response.ok) {
    throw new ApiError(data.message || 'Something went wrong', response.status);
  }
  return data;
}

// authAPI.login / registerTenant responses shape: { success, data: { user, tenant, token } }
// — see backend/controllers/authController.js. Token is issued for Bearer use by
// native clients since they can't hold the httpOnly cookie the web app uses.
export const authAPI = {
  login: (email: string, password: string) =>
    request<{
      success: boolean;
      data: { user: any; tenant: any; token: string };
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  registerTenant: (payload: {
    orgName: string;
    orgType: string;
    ownerName: string;
    email: string;
    phone: string;
    city: string;
    state: string;
    doctorCount: number;
    gstin?: string;
    password: string;
    acceptTerms: boolean;
  }) =>
    request<{
      success: boolean;
      data: { user: any; tenant: any; token: string };
    }>('/auth/register-tenant', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  registerPatient: (payload: {
    clinicCode: string;
    name: string;
    email: string;
    phone: string;
    dob: string;
    gender: string;
    password: string;
    acceptTerms: boolean;
  }) =>
    request<{
      success: boolean;
      data: { user: any; tenant: any; token: string };
    }>('/auth/register-patient', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  clinicLookup: (slug: string) =>
    request<{ success: boolean; data: { name: string } }>(
      `/auth/clinic/${encodeURIComponent(slug)}`,
    ),
  getMe: () =>
    request<{ success: boolean; data: { user: any; tenant: any } }>('/auth/me'),
  logout: () =>
    request<{ success: boolean; data: any }>('/auth/logout', {
      method: 'POST',
    }),
};

// Patient accounts use the self-service /me/* routes; clinic staff keep the tenant-wide ones.
async function isPatient(): Promise<boolean> {
  try {
    const u = await storage.getItem('user');
    return !!u && JSON.parse(u).role === 'patient';
  } catch {
    return false;
  }
}

type ListRes = { success: boolean; count: number; data: any[] };
type OneRes = { success: boolean; data: any };

async function findIn(path: string, id: string): Promise<OneRes> {
  const r = await request<ListRes>(path);
  const found = r.data.find(x => x._id === id);
  if (!found) throw new ApiError('Not found', 404);
  return { success: true, data: found };
}

export const appointmentsAPI = {
  getAll: async () =>
    request<ListRes>(
      (await isPatient()) ? '/me/appointments' : '/appointments',
    ),
  getOne: async (id: string) =>
    (await isPatient())
      ? findIn('/me/appointments', id)
      : request<OneRes>(`/appointments/${id}`),
  create: async (data: {
    patientId: string;
    doctorId: string;
    scheduledAt: string;
    reason?: string;
    notes?: string;
  }) =>
    request<OneRes>(
      (await isPatient()) ? '/me/appointments' : '/appointments',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
    ),
  cancel: (id: string, reason?: string) =>
    request<OneRes>(`/me/appointments/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
};

export const doctorsAPI = {
  getAll: async () =>
    request<ListRes>((await isPatient()) ? '/me/doctors' : '/doctors'),
  getOne: async (id: string) =>
    (await isPatient())
      ? findIn('/me/doctors', id)
      : request<OneRes>(`/doctors/${id}`),
};

// Patient accounts: their own + family profiles. Staff: the tenant's patient list.
export const patientsAPI = {
  getAll: async () =>
    request<ListRes>((await isPatient()) ? '/me/profiles' : '/patients'),
};

export const slotsAPI = {
  forDoctor: async (doctorId: string, date: string) =>
    request<ListRes>(
      `${(await isPatient()) ? '/me' : ''}/doctors/${doctorId}/slots?date=${date}`,
    ),
};

export const meAPI = {
  prescriptions: () => request<ListRes>('/me/prescriptions'),
  vitals: () => request<ListRes>('/me/vitals'),
  addVital: (d: {
    type: string;
    value: number;
    value2?: number;
    unit?: string;
  }) =>
    request<OneRes>('/me/vitals', { method: 'POST', body: JSON.stringify(d) }),
  reminders: () => request<ListRes>('/me/reminders'),
  addReminder: (d: { drug: string; times: string[]; dose?: string }) =>
    request<OneRes>('/me/reminders', {
      method: 'POST',
      body: JSON.stringify(d),
    }),
  updateReminder: (id: string, d: { active?: boolean; times?: string[] }) =>
    request<OneRes>(`/me/reminders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(d),
    }),
  deleteReminder: (id: string) =>
    request<OneRes>(`/me/reminders/${id}`, { method: 'DELETE' }),
  deleteVital: (id: string) =>
    request<OneRes>(`/me/vitals/${id}`, { method: 'DELETE' }),
  records: () => request<ListRes>('/me/records'),
  invoices: () => request<ListRes>('/me/invoices'),
  labOrders: () => request<ListRes>('/me/lab-orders'),
  videoLink: (appointmentId: string) =>
    request<{ success: boolean; data: { url: string } }>(
      `/me/appointments/${appointmentId}/video-link`,
    ),
};
