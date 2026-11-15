let csrfToken = "";

async function request(path, { method = "GET", body } = {}, csrfRetry = false) {
  const headers = { Accept: "application/json" };
  const options = {
    method,
    headers,
    credentials: "same-origin",
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    if (!csrfToken) await session();
    headers["X-CSRF-Token"] = csrfToken;
  }

  const response = await fetch(path, options);
  if (response.status === 204) return null;

  const payload = await response.json().catch(() => ({}));
  if (response.status === 403 && !csrfRetry && !["GET", "HEAD", "OPTIONS"].includes(method)) {
    csrfToken = "";
    await session();
    return request(path, { method, body }, true);
  }
  if (!response.ok) {
    const error = new Error(payload.error || "The request could not be completed.");
    error.status = response.status;
    throw error;
  }
  if (typeof payload.csrfToken === "string") csrfToken = payload.csrfToken;
  else if (payload.csrfToken === null) csrfToken = "";
  return payload;
}

function queryString(values) {
  const query = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") query.set(key, value);
  });
  return query.toString();
}

export const api = {
  session: () => request("/api/auth/session"),
  register: (body) => request("/api/auth/register", { method: "POST", body }),
  login: (body) => request("/api/auth/login", { method: "POST", body }),
  logout: () => request("/api/auth/logout", { method: "POST" }).then((result) => {
    csrfToken = "";
    return result;
  }),
  updateProfile: (body) => request("/api/auth/profile", { method: "PATCH", body }),
  changePassword: (body) => request("/api/auth/password", { method: "PUT", body }),
  adminUsers: () => request("/api/admin/users"),
  adminReport: (month) => request(`/api/admin/reports?${queryString({ month })}`),
  updateUserRole: (id, role) => request(`/api/admin/users/${encodeURIComponent(id)}/role`, { method: "PATCH", body: { role } }),
  categories: () => request("/api/categories"),
  transactions: (filters) => request(`/api/transactions?${queryString(filters)}`),
  createTransaction: (body) => request("/api/transactions", { method: "POST", body }),
  updateTransaction: (id, body) => request(`/api/transactions/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  deleteTransaction: (id) => request(`/api/transactions/${encodeURIComponent(id)}`, { method: "DELETE" }),
  dashboard: (month, period) => request(`/api/dashboard?${queryString({ month, period })}`),
  budgets: (month) => request(`/api/budgets?${queryString({ month })}`),
  saveBudget: (body) => request("/api/budgets", { method: "PUT", body }),
  saveCategoryBudget: (id, body) => request(`/api/budgets/categories/${encodeURIComponent(id)}`, { method: "PUT", body }),
  goals: (month) => request(`/api/goals?${queryString({ month })}`),
  createGoal: (body) => request("/api/goals", { method: "POST", body }),
  updateGoal: (id, body) => request(`/api/goals/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  deleteGoal: (id) => request(`/api/goals/${encodeURIComponent(id)}`, { method: "DELETE" }),
  contributeToGoal: (id, body) => request(`/api/goals/${encodeURIComponent(id)}/contributions`, { method: "POST", body }),
};
