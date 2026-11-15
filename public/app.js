import { api } from "./api.js";

const STORAGE_KEY = "pennysaurus.preferences.v1";
const NAV_ITEMS = [
  ["overview", "Overview", "▦"],
  ["transactions", "Transactions", "⇄"],
  ["budgets", "Budgets", "▤"],
  ["goals", "Goals", "◎"],
  ["reports", "Reports", "▥"],
  ["settings", "Settings", "⚙"],
];
const CURRENCIES = [
  ["PHP", "PHP — Philippine Peso"],
  ["USD", "USD — US Dollar"],
  ["EUR", "EUR — Euro"],
  ["JPY", "JPY — Japanese Yen"],
];
const VALID_PAGES = new Set(NAV_ITEMS.map(([id]) => id));

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function readPreferences() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return {
      theme: stored?.theme === "light" ? "light" : "dark",
      currentPage: VALID_PAGES.has(stored?.currentPage) ? stored.currentPage : "overview",
      month: /^\d{4}-(0[1-9]|1[0-2])$/.test(stored?.month || "") ? stored.month : currentMonth(),
      period: stored?.period === "year" ? "year" : "six-months",
      weeklySummary: stored?.weeklySummary !== false,
    };
  } catch (error) {
    console.warn("Could not read saved display preferences.", error);
    return { theme: "dark", currentPage: "overview", month: currentMonth(), period: "six-months", weeklySummary: true };
  }
}

const state = {
  ...readPreferences(),
  authMode: "login",
  user: null,
  categories: [],
  transactions: [],
  goals: [],
  savingsActivity: [],
  dashboard: null,
  budgetData: null,
  filters: { search: "", categoryId: "", type: "", sort: "newest" },
  connectionError: "",
};
let toastTimeout;
let filterTimeout;
let chartInstances = [];

function persistPreferences() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      theme: state.theme,
      currentPage: state.currentPage,
      month: state.month,
      period: state.period,
      weeklySummary: state.weeklySummary,
    }));
  } catch (error) {
    console.warn("Could not save display preferences.", error);
    toast("Your browser could not save this preference.");
  }
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function currencyCode() {
  return CURRENCIES.some(([code]) => code === state.user?.currency) ? state.user.currency : "PHP";
}

function money(value, decimals = true) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: currencyCode(),
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  }).format(Number(value) || 0);
}

function monthDate(month = state.month) {
  const [year, value] = month.split("-").map(Number);
  return new Date(year, value - 1, 1);
}

function monthName(month = state.month, options = { month: "long", year: "numeric" }) {
  return monthDate(month).toLocaleDateString("en-US", options);
}

function monthOptions(selected = state.month) {
  const base = monthDate(selected);
  return Array.from({ length: 19 }, (_, index) => {
    const date = new Date(base.getFullYear(), base.getMonth() - 6 + index, 1);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    return `<option value="${value}" ${value === selected ? "selected" : ""}>${monthName(value)}</option>`;
  }).join("");
}

function toast(message) {
  const element = document.querySelector("#toast");
  if (!element) return;
  element.textContent = message;
  element.classList.add("visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => element.classList.remove("visible"), 3000);
}

function navMarkup() {
  return NAV_ITEMS.map(([id, label, icon]) => `<button class="nav-link ${state.currentPage === id ? "active" : ""}" type="button" data-page="${id}" aria-current="${state.currentPage === id ? "page" : "false"}">
    <span class="nav-icon" aria-hidden="true">${icon}</span><span class="nav-label">${label}</span>
  </button>`).join("");
}

function pageTitle() {
  return NAV_ITEMS.find(([id]) => id === state.currentPage)?.[1] || "Overview";
}

function topbarMarkup() {
  return `<header class="topbar">
    <div class="breadcrumbs"><span>My workspace</span><span class="crumb-separator">/</span><strong>${pageTitle()}</strong></div>
    <div class="toolbar">
      <button class="icon-button theme-toggle" type="button" data-action="theme" aria-label="${state.theme === "dark" ? "Use light mode" : "Use dark mode"}">${state.theme === "dark" ? "☼" : "☾"}</button>
      <label class="month-select-label"><span class="sr-only">Selected month</span><span class="month-icon" aria-hidden="true">▦</span><select class="month-select" data-action="month">${monthOptions()}</select></label>
      <button class="icon-button notification-button" type="button" data-action="notifications" aria-label="Notifications" aria-expanded="false">♧<i></i></button>
      <button class="button button-primary add-button" type="button" data-action="add-transaction"><span aria-hidden="true">＋</span> Add transaction</button>
    </div>
    <div class="notification-popover" id="notification-popover" hidden><strong>Monthly summary</strong><span>${state.dashboard ? `${state.dashboard.transactionCount} transactions recorded this month.` : "Your latest activity will appear here."}</span></div>
  </header>`;
}

function footerMarkup() {
  return `<footer class="page-footer"><span>SMART PERSONAL FINANCE TRACKER</span><span>${escapeHTML(currencyCode())} · ${escapeHTML(monthName())}</span></footer>`;
}

function welcomeSection() {
  const firstName = escapeHTML(state.user?.name.split(/\s+/)[0] || "there");
  return `<section class="welcome-row">
    <div><p class="eyebrow">${escapeHTML(monthName().toUpperCase())}</p><h1>Good morning, ${firstName}.</h1><p class="muted">Here’s your ${escapeHTML(monthName(undefined, { month: "long" }))} money story.</p></div>
    <span class="status-pill"><span aria-hidden="true">●</span> ${state.dashboard?.budget && state.dashboard.expenses <= state.dashboard.budget ? "On track this month" : "Keep an eye on your spending"}</span>
  </section>`;
}

function summaryCards() {
  const summary = state.dashboard || {};
  const income = Number(summary.income || 0);
  const expenses = Number(summary.expenses || 0);
  const net = Number(summary.netSavings || 0);
  return `<section class="summary-grid" aria-label="Monthly summary">
    <article class="summary-card"><div class="card-top"><span>Available balance</span><span class="metric-icon balance-icon">▱</span></div><strong class="metric-value">${money(summary.balance || 0)}</strong><span class="metric-caption">Income less expenses and savings</span></article>
    <article class="summary-card"><div class="card-top"><span>Monthly income</span><span class="metric-icon income-icon">↗</span></div><strong class="metric-value">${money(income)}</strong><span class="metric-caption">Recorded for ${escapeHTML(monthName())}</span></article>
    <article class="summary-card"><div class="card-top"><span>Monthly expenses</span><span class="metric-icon expense-icon">⇄</span></div><strong class="metric-value">${money(expenses)}</strong><span class="metric-caption">${money(summary.budgetRemaining || 0, false)} below your budget</span></article>
    <article class="summary-card"><div class="card-top"><span>Net savings</span><span class="metric-icon savings-icon">◎</span></div><strong class="metric-value">${money(net)}</strong><span class="metric-caption">${income ? Math.round(net / income * 100) : 0}% of this month’s income</span></article>
  </section>`;
}

function cashflowPanel() {
  return `<article class="panel cashflow-panel">
    <div class="panel-heading"><div><h2>Cash flow</h2><p>A clearer picture of what comes in and goes out.</p></div><button class="select-button" type="button" data-action="period" aria-label="Change report period">${state.period === "year" ? "This year" : "Last 6 months"} <span aria-hidden="true">⌄</span></button></div>
    <div class="chart-legend"><span><i class="legend-dot income-dot"></i>Income</span><span><i class="legend-dot expense-dot"></i>Expenses</span></div>
    <div class="chart-area"><canvas id="cashflow-chart" role="img" aria-label="Income and expenses over the selected report period"></canvas></div>
  </article>`;
}

function transactionRow(item, actions = false) {
  const date = new Date(`${item.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "2-digit" });
  return `<div class="transaction-row ${actions ? "has-actions" : ""}" data-type="${escapeHTML(item.type)}" data-category="${escapeHTML(item.category)}">
    <span class="transaction-name"><i class="transaction-icon" aria-hidden="true">${item.type === "income" ? "↓" : "◈"}</i><span><strong>${escapeHTML(item.description)}</strong><small>${date}</small></span></span>
    <span class="transaction-category">${escapeHTML(item.category)}</span>
    <strong class="amount ${item.type === "income" ? "income-amount" : "expense-amount"}">${item.type === "income" ? "+" : "−"}${money(item.amount)}</strong>
    ${actions ? `<span class="transaction-actions"><button class="text-button" type="button" data-action="edit-transaction" data-id="${escapeHTML(item.id)}">Edit</button><button class="text-button danger-link" type="button" data-action="delete-transaction" data-id="${escapeHTML(item.id)}">Delete</button></span>` : ""}
  </div>`;
}

function activityPanel() {
  const rows = state.dashboard?.recentTransactions || [];
  return `<article class="panel activity-panel"><div class="panel-heading activity-heading"><div><h2>Recent activity</h2></div><button class="text-button" type="button" data-page="transactions">All transactions <span aria-hidden="true">→</span></button></div>
    <div class="transaction-head"><span>TRANSACTION</span><span>CATEGORY</span><span>AMOUNT</span></div>
    <div class="transaction-list">${rows.map((item) => transactionRow(item)).join("") || `<p class="empty-state">No transactions yet. Add income or an expense to get started.</p>`}</div></article>`;
}

function budgetPanel() {
  const summary = state.dashboard || {};
  const budget = Number(summary.budget || 0);
  const spent = Number(summary.expenses || 0);
  const remaining = Math.max(0, budget - spent);
  const progress = budget ? Math.min(100, spent / budget * 100) : 0;
  return `<article class="panel budget-panel"><div class="panel-heading"><div><h2>Room to breathe.</h2><p>Monthly budget</p></div><span class="budget-icon">◉</span></div>
    <strong class="budget-remaining">${money(remaining, false)}</strong><p class="budget-caption">${budget ? "left to spend this month" : "Set a monthly budget to begin"}</p><div class="budget-track"><i style="width:${progress}%"></i></div>
    <div class="budget-totals"><span>${money(spent, false)} spent</span><span>${money(budget, false)} budget</span></div>
    <div class="budget-note"><span>✦</span><span><strong>${budget && spent > budget ? "You’ve reached your budget." : "A plan makes progress visible."}</strong><small>Review your monthly limits.</small></span></div>
  </article>`;
}

function goalList(limit = 3) {
  const goals = state.goals.slice(0, limit);
  if (!goals.length) return `<p class="empty-state">Create a savings goal to start tracking a milestone.</p>`;
  return goals.map((goal) => {
    const progress = Math.min(100, Math.round(goal.saved / goal.target * 100));
    return `<div class="goal-item"><div class="goal-title"><strong>${escapeHTML(goal.name)}</strong><span>${progress}%</span></div><div class="goal-amount">${money(goal.saved)} <span>/ ${money(goal.target)}</span></div><div class="progress-track"><i style="width:${progress}%"></i></div></div>`;
  }).join("");
}

function overviewPage() {
  return `${welcomeSection()}${summaryCards()}<section class="dashboard-grid">${cashflowPanel()}
    <article class="panel goals-panel"><div class="panel-heading"><div><h2>Big things, little by little.</h2><p>Your savings goals</p></div><span class="sparkle">✳</span></div><div class="goal-list">${goalList()}</div><button class="text-button panel-link" type="button" data-page="goals">View all goals →</button></article>
    ${activityPanel()}${budgetPanel()}</section>`;
}

function transactionFilters() {
  return `<section class="filter-bar panel">
    <label class="search-field"><span aria-hidden="true">⌕</span><span class="sr-only">Search transactions</span><input type="search" placeholder="Search transactions" value="${escapeHTML(state.filters.search)}" data-filter="search"></label>
    <label class="sr-only" for="category-filter">Category</label><select id="category-filter" data-filter="categoryId"><option value="">All categories</option>${state.categories.map((category) => `<option value="${category.id}" ${String(category.id) === state.filters.categoryId ? "selected" : ""}>${escapeHTML(category.name)}</option>`).join("")}</select>
    <label class="sr-only" for="type-filter">Type</label><select id="type-filter" data-filter="type"><option value="">All types</option><option value="income" ${state.filters.type === "income" ? "selected" : ""}>Income</option><option value="expense" ${state.filters.type === "expense" ? "selected" : ""}>Expenses</option></select>
    <label class="sr-only" for="sort-filter">Sort transactions</label><select id="sort-filter" data-filter="sort"><option value="newest" ${state.filters.sort === "newest" ? "selected" : ""}>Newest first</option><option value="oldest" ${state.filters.sort === "oldest" ? "selected" : ""}>Oldest first</option><option value="highest" ${state.filters.sort === "highest" ? "selected" : ""}>Highest amount</option><option value="lowest" ${state.filters.sort === "lowest" ? "selected" : ""}>Lowest amount</option><option value="name" ${state.filters.sort === "name" ? "selected" : ""}>Description</option></select>
  </section>`;
}

function transactionsPage() {
  const transactions = state.transactions;
  return `<section class="page-heading"><div><h1>Transactions</h1><p>See where every peso goes.</p></div><button class="button button-primary page-action" type="button" data-action="add-transaction">＋ Add transaction</button></section>
    ${transactionFilters()}
    <section class="panel full-panel"><div class="panel-heading table-heading"><div><h2>${escapeHTML(monthName())} activity</h2><p>${transactions.length} transaction${transactions.length === 1 ? "" : "s"}</p></div><button class="button button-quiet" type="button" data-action="export-csv">⇩ Export CSV</button></div>
      <div class="transaction-head"><span>TRANSACTION</span><span>CATEGORY</span><span>AMOUNT</span><span class="sr-only">Actions</span></div>
      <div class="transaction-list all-transactions">${transactions.map((item) => transactionRow(item, true)).join("") || `<p class="empty-state">No transactions match these filters.</p>`}</div>
    </section>`;
}

function budgetPage() {
  const monthBudget = state.budgetData?.budget;
  const amount = Number(monthBudget?.amount || 0);
  const spent = Number(state.dashboard?.expenses || 0);
  const used = amount ? Math.min(100, Math.round(spent / amount * 100)) : 0;
  const categorySpending = new Map((state.dashboard?.categorySpending || []).map((item) => [String(item.categoryId), Number(item.amount)]));
  const categoryLimits = new Map((state.budgetData?.categoryBudgets || []).map((item) => [String(item.categoryId), Number(item.amount)]));
  const daysInMonth = new Date(monthDate().getFullYear(), monthDate().getMonth() + 1, 0).getDate();
  const daysLeft = Math.max(0, daysInMonth - new Date().getDate());
  const categories = state.categories.filter((category) => category.type === "expense");
  return `<section class="page-heading"><div><h1>Monthly budget</h1><p>Give every peso a purpose before you spend it.</p></div></section>
    <form class="panel budget-form" id="budget-form"><label>Budget month<select name="month">${monthOptions()}</select></label>
      <label>Monthly limit<div class="money-input"><span>${escapeHTML(currencyCode())}</span><input name="amount" type="number" min="0.01" step="0.01" value="${amount || ""}" required></div></label>
      <button class="button button-primary" type="submit">Save budget</button></form>
    <section class="budget-overview-grid"><article class="panel spend-panel"><span class="eyebrow">MONTHLY SPEND</span><strong>${money(spent)}</strong><p>of ${money(amount)} budget</p><div class="budget-track"><i style="width:${used}%"></i></div><div class="budget-totals"><span>${used}% used</span><span class="positive">${money(Math.max(0, amount - spent))} left</span></div></article>
      <article class="panel budget-insight"><div><span class="status-pill"><span>●</span> ${amount && spent > amount ? "Over budget" : "Budget tracker"}</span><h2>${amount ? (spent <= amount ? "On track and in control." : "You’re over your budget.") : "Start with a monthly limit."}</h2><p>${amount ? `You’re ${money(Math.abs(amount - spent))} ${spent <= amount ? "under" : "over"} budget with ${daysLeft} days left in the month.` : "Set a budget to compare your plan with actual spending."}</p></div></article></section>
    <section class="panel category-panel"><div class="panel-heading"><div><h2>Category limits</h2><p>Keep an eye on your biggest spending areas.</p></div></div><div class="category-grid">${categories.map((category) => {
      const limit = categoryLimits.get(String(category.id)) || 0;
      const spentInCategory = categorySpending.get(String(category.id)) || 0;
      const percent = limit ? Math.min(100, spentInCategory / limit * 100) : 0;
      return `<label class="category-card"><span class="category-card-top"><strong>${escapeHTML(category.name)}</strong><span>${money(spentInCategory)} / <input aria-label="${escapeHTML(category.name)} budget limit" type="number" min="0.01" step="0.01" value="${limit || ""}" data-category-budget="${category.id}"></span></span><span class="progress-track"><i style="width:${percent}%"></i></span><small>${limit ? `${money(Math.max(0, limit - spentInCategory))} remaining` : "No category limit set"}</small></label>`;
    }).join("") || `<p class="empty-state">Your expense categories will appear here.</p>`}</div><button class="button button-quiet save-categories" type="button" data-action="save-categories">Save category limits</button></section>`;
}

function goalsPage() {
  const total = state.goals.reduce((sum, goal) => sum + Number(goal.saved), 0);
  const contribution = state.goals.reduce((sum, goal) => sum + Number(goal.contribution), 0);
  const next = [...state.goals].sort((a, b) => a.saved / a.target - b.saved / b.target)[0];
  return `<section class="page-heading"><div><h1>Savings goals</h1><p>Build your next milestone, one peso at a time.</p></div><button class="button button-primary page-action" type="button" data-action="add-goal">＋ New goal</button></section>
    <section class="goal-summary-grid"><article class="summary-card"><span>Current savings</span><strong>${money(total)}</strong></article><article class="summary-card"><span>Monthly contribution</span><strong>${money(contribution)}</strong></article><article class="summary-card next-goal-summary"><span>Next milestone</span><strong>${escapeHTML(next?.name || "Create your first goal")}</strong></article></section>
    <section class="goal-card-grid">${state.goals.map((goal) => {
      const progress = Math.min(100, Math.round(goal.saved / goal.target * 100));
      return `<article class="panel goal-card"><div class="goal-card-top"><span class="metric-icon">◎</span><span>${progress}% complete</span></div><h2>${escapeHTML(goal.name)}</h2><p>${money(goal.saved)} of ${money(goal.target)}</p><div class="progress-track"><i style="width:${progress}%"></i></div><div class="goal-card-foot"><span>Target: ${escapeHTML(monthName(goal.targetMonth))}</span><span>${money(goal.contribution, false)} / month</span></div><div class="goal-actions"><button class="button button-quiet" type="button" data-action="contribute" data-id="${goal.id}">＋ Add savings</button><button class="text-button" type="button" data-action="edit-goal" data-id="${goal.id}">Edit</button><button class="text-button danger-link" type="button" data-action="delete-goal" data-id="${goal.id}">Delete</button></div></article>`;
    }).join("") || `<div class="panel empty-goals"><h2>No savings goals yet</h2><p>Create a goal and make your next milestone happen.</p></div>`}</section>
    <section class="panel savings-activity"><div class="panel-heading"><div><h2>Savings activity</h2><p>${escapeHTML(monthName())}</p></div></div>${state.savingsActivity.map((item) => `<div class="savings-row"><span>${new Date(`${item.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span><strong>${escapeHTML(item.goalName)}</strong><b>+${money(item.amount)}</b></div>`).join("") || `<p class="empty-state">No savings contributions this month yet.</p>`}</section>`;
}

function reportsPage() {
  const summary = state.dashboard || {};
  const categories = summary.categorySpending || [];
  return `<section class="page-heading report-heading"><div><h1>Reports</h1><p>Understand where your money goes.</p></div><div class="report-actions"><select aria-label="Report month" data-action="month">${monthOptions()}</select><button class="button button-primary" type="button" data-action="statement">View statement</button></div></section>
    <section class="summary-grid report-summary"><article class="summary-card"><span>Income</span><strong class="metric-value">${money(summary.income || 0, false)}</strong></article><article class="summary-card"><span>Expenses</span><strong class="metric-value">${money(summary.expenses || 0, false)}</strong></article><article class="summary-card"><span>Net savings</span><strong class="metric-value">${money(summary.netSavings || 0, false)}</strong></article></section>
    <section class="panel report-chart"><div class="panel-heading"><div><h2>Income vs expenses</h2><div class="chart-legend"><span><i class="legend-dot income-dot"></i>Income</span><span><i class="legend-dot expense-dot"></i>Expenses</span></div></div></div><div class="report-chart-area"><canvas id="reports-chart" role="img" aria-label="Monthly income and expense comparison"></canvas></div></section>
    <section class="report-bottom-grid"><article class="panel category-report"><div class="panel-heading"><div><h2>Spending by category</h2></div></div>${categories.map((item) => {
      const largest = Math.max(1, ...categories.map((category) => Number(category.amount)));
      return `<div class="report-category"><strong>${escapeHTML(item.category)}</strong><span class="report-track"><i style="width:${Number(item.amount) / largest * 100}%"></i></span><span>${money(item.amount, false)}</span></div>`;
    }).join("") || `<p class="empty-state">Add expenses to see your spending categories.</p>`}</article>
      <article class="panel monthly-insight"><span class="metric-icon">↗</span><h2>Your monthly insight</h2><strong>You saved ${summary.income ? Math.round(summary.netSavings / summary.income * 100) : 0}% of your income.</strong><p>${categories[0] ? `${escapeHTML(categories[0].category)} is your largest expense category.` : "Your spending insights will appear when you record transactions."}</p><button class="button button-quiet" type="button" data-page="budgets">Review budget</button></article></section>`;
}

function settingsPage() {
  return `<section class="page-heading"><div><h1>Settings</h1><p>Make Pennysaurus feel like yours.</p></div></section>
    <form id="settings-form"><section class="settings-grid">
      <article class="panel settings-card"><h2>Profile</h2><label>Name<input name="name" value="${escapeHTML(state.user.name)}" required maxlength="80"></label><label>Email<input name="email" type="email" value="${escapeHTML(state.user.email)}" required maxlength="254"></label></article>
      <article class="panel settings-card"><h2>Preferences</h2><label>Currency<select name="currency">${CURRENCIES.map(([code, label]) => `<option value="${code}" ${state.user.currency === code ? "selected" : ""}>${label}</option>`).join("")}</select></label>
        <div class="preference-row"><span><small>Appearance</small><strong>Charcoal &amp; copper</strong></span><button class="button theme-preference" type="button" data-action="theme"><span class="legend-dot income-dot"></span>${state.theme === "dark" ? "Dark" : "Light"}</button></div>
        <label class="preference-row weekly-toggle"><span><small>Weekly summary</small><strong>Helpful insights every Monday</strong></span><input name="weeklySummary" type="checkbox" ${state.weeklySummary ? "checked" : ""}><i aria-hidden="true"></i></label>
      </article>
    </section><section class="panel security-card"><h2>Security &amp; data</h2><div class="security-row"><span><strong>Account security</strong><small>Your password is hashed on the server; session cookies are HTTP-only.</small></span></div>
      <div class="security-row"><span><strong>Change password</strong><small>Use a unique password for this account.</small></span><button class="button button-quiet" type="button" data-action="password">Change password</button></div>
      <div class="security-row"><span><strong>Your data stays yours.</strong><small>Export your recorded transactions for this month.</small></span><button class="button button-quiet" type="button" data-action="export-csv">Export CSV</button></div></section>
      <div class="settings-actions"><button class="button button-primary" type="submit">Save changes</button><button class="button button-quiet" type="button" data-action="sign-out">Sign out</button></div>
    </form>`;
}

function loginPage() {
  const register = state.authMode === "register";
  return `<section class="auth-screen"><header class="auth-top"><a class="brand" href="/" aria-label="Pennysaurus"><img class="brand-mark" src="assets/pennysaurus-mark.png" alt=""><span>pennysaurus</span></a><button class="icon-button" type="button" data-action="theme" aria-label="Toggle color theme">${state.theme === "dark" ? "☼" : "☾"}</button></header>
    <form class="auth-card" id="auth-form"><p class="eyebrow">SMART PERSONAL FINANCE TRACKER</p><h1>${register ? "Create your account" : "Welcome back"}</h1><p>Track income, spending, and monthly progress in one place.</p>
      ${register ? `<label>Name<input name="name" placeholder="Your name" autocomplete="name" required minlength="2" maxlength="80"></label>` : ""}
      <label>Email<input name="email" type="email" placeholder="you@example.com" autocomplete="email" required maxlength="254"></label>
      <label>Password<input name="password" type="password" placeholder="At least 8 characters" autocomplete="${register ? "new-password" : "current-password"}" required minlength="8" maxlength="128"></label>
      <button class="button button-primary auth-submit" type="submit">${register ? "Create account" : "Sign in"}</button>
      <button class="button button-quiet auth-switch" type="button" data-action="toggle-auth">${register ? "Already have an account? Sign in" : "Create an account"}</button>
      <p class="demo-disclaimer">Your financial data is private to your account and stored in the application database.</p>
    </form></section>`;
}

function connectionPage() {
  return `<section class="auth-screen"><div class="auth-card"><p class="eyebrow">SMART PERSONAL FINANCE TRACKER</p><h1>We can’t reach the server.</h1><p>${escapeHTML(state.connectionError || "Check the connection and try again.")}</p><button class="button button-primary auth-submit" type="button" data-action="retry">Try again</button></div></section>`;
}

function destroyCharts() {
  chartInstances.forEach((chart) => chart.destroy());
  chartInstances = [];
}

function chartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => `${context.dataset.label}: ${money(context.parsed.y, false)}`,
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: "#9a9d97" } },
      y: { beginAtZero: true, ticks: { color: "#9a9d97", callback: (value) => money(value, false) }, grid: { color: "rgba(154,157,151,.15)" } },
    },
  };
}

function renderCharts() {
  if (!window.Chart) {
    window.addEventListener("load", renderCharts, { once: true });
    return;
  }
  const cashflowCanvas = document.querySelector("#cashflow-chart");
  if (cashflowCanvas) {
    const cashFlow = state.dashboard?.cashFlow || [];
    chartInstances.push(new window.Chart(cashflowCanvas, {
      type: "line",
      data: {
        labels: cashFlow.map((item) => monthName(item.month, { month: "short" })),
        datasets: [
          { label: "Income", data: cashFlow.map((item) => item.income), borderColor: "#e2a16d", backgroundColor: "rgba(226,161,109,.12)", tension: 0.35, fill: true },
          { label: "Expenses", data: cashFlow.map((item) => item.expenses), borderColor: "#849da2", backgroundColor: "rgba(132,157,162,.08)", tension: 0.35, fill: true },
        ],
      },
      options: chartOptions(),
    }));
  }

  const reportCanvas = document.querySelector("#reports-chart");
  if (reportCanvas) {
    const cashFlow = state.dashboard?.cashFlow || [];
    chartInstances.push(new window.Chart(reportCanvas, {
      type: "bar",
      data: {
        labels: cashFlow.map((item) => monthName(item.month, { month: "short" })),
        datasets: [
          { label: "Income", data: cashFlow.map((item) => item.income), backgroundColor: "#c98250", borderRadius: 4 },
          { label: "Expenses", data: cashFlow.map((item) => item.expenses), backgroundColor: "#777274", borderRadius: 4 },
        ],
      },
      options: { ...chartOptions(), scales: { ...chartOptions().scales, x: { ...chartOptions().scales.x, stacked: false }, y: { ...chartOptions().scales.y, stacked: false } } },
    }));
  }
}

function render() {
  destroyCharts();
  document.body.dataset.theme = state.theme;
  const app = document.querySelector("#app");
  if (state.connectionError) {
    app.innerHTML = connectionPage();
    return;
  }
  if (!state.user) {
    app.innerHTML = loginPage();
    return;
  }
  const pages = {
    overview: overviewPage,
    transactions: transactionsPage,
    budgets: budgetPage,
    goals: goalsPage,
    reports: reportsPage,
    settings: settingsPage,
  };
  app.innerHTML = `<div class="app-shell d-flex min-vh-100"><aside class="sidebar" aria-label="Main sidebar">
      <button class="brand brand-button" type="button" data-page="overview"><img class="brand-mark" src="assets/pennysaurus-mark.png" alt=""><span>pennysaurus</span></button><p class="side-label">PERSONAL FINANCE</p><nav class="main-nav" aria-label="Main navigation">${navMarkup()}</nav>
      <button class="goal-prompt" type="button" data-page="goals"><strong>Small steps,<br>bigger possibilities.</strong><span>Your next goal is closer than you think.</span><span class="goal-prompt-link">Explore your goals →</span></button>
      <div class="profile"><span class="avatar">${escapeHTML(state.user.name[0]?.toUpperCase() || "P")}</span><span><strong>${escapeHTML(state.user.name)}</strong><small>Personal workspace</small></span><button class="profile-more" type="button" data-page="settings" aria-label="Open settings">···</button></div>
    </aside><div class="workspace">${topbarMarkup()}<main id="main-content">${pages[state.currentPage]()}${footerMarkup()}</main></div>
    <nav class="mobile-nav" aria-label="Mobile navigation">${navMarkup()}</nav></div>`;
  renderCharts();
}

function showDialog(title, body, submitLabel = "Save") {
  const root = document.querySelector("#modal-root");
  root.innerHTML = `<dialog class="app-dialog"><div class="dialog-form"><div class="dialog-heading"><div><p class="eyebrow">PENNYSAURUS</p><h2>${escapeHTML(title)}</h2></div><button class="icon-button" type="button" data-action="close-dialog" aria-label="Close dialog">×</button></div><div class="dialog-content">${body}</div><div class="dialog-actions"><button class="button button-quiet" type="button" data-action="close-dialog">Cancel</button><button class="button button-primary" type="button" data-dialog-submit>${escapeHTML(submitLabel)}</button></div></div></dialog>`;
  const dialog = root.querySelector("dialog");
  const form = dialog.querySelector(".dialog-content form");
  const submitButton = dialog.querySelector("[data-dialog-submit]");
  if (form) {
    if (!form.id) form.id = "dialog-form";
    submitButton.type = "submit";
    submitButton.setAttribute("form", form.id);
  } else {
    submitButton.dataset.action = "close-dialog";
  }
  dialog.showModal();
  dialog.querySelector(".dialog-content input, .dialog-content select")?.focus();
  dialog.addEventListener("close", () => root.replaceChildren(), { once: true });
}

function closeDialog() {
  document.querySelector("#modal-root dialog")?.close();
}

function openTransactionDialog(transaction = null) {
  const income = state.categories.filter((category) => category.type === "income");
  const expense = state.categories.filter((category) => category.type === "expense");
  const type = transaction?.type || "expense";
  const choices = type === "income" ? income : expense;
  const date = transaction?.date || `${state.month}-14`;
  showDialog(transaction ? "Edit transaction" : "Add a transaction", `<form id="transaction-form" data-id="${transaction ? escapeHTML(transaction.id) : ""}">
    <label>Description<input name="description" type="text" value="${escapeHTML(transaction?.description || "")}" maxlength="120" required></label>
    <label>Amount (${escapeHTML(currencyCode())})<input name="amount" type="number" min="0.01" max="9999999999.99" step="0.01" value="${transaction ? escapeHTML(transaction.amount) : ""}" required></label>
    <label>Type<select name="type"><option value="expense" ${type === "expense" ? "selected" : ""}>Expense</option><option value="income" ${type === "income" ? "selected" : ""}>Income</option></select></label>
    <label>Category<select name="categoryId">${choices.map((category) => `<option value="${category.id}" ${String(category.id) === String(transaction?.categoryId) ? "selected" : ""}>${escapeHTML(category.name)}</option>`).join("")}</select></label>
    <label>Date<input name="date" type="date" value="${escapeHTML(date)}" required></label>
  </form>`, transaction ? "Save transaction" : "Add transaction");
  const transactionForm = document.querySelector("#transaction-form");
  transactionForm.addEventListener("change", (event) => {
    if (event.target.name !== "type") return;
    const list = event.target.value === "income" ? income : expense;
    transactionForm.elements.categoryId.innerHTML = list.map((category) => `<option value="${category.id}">${escapeHTML(category.name)}</option>`).join("");
  });
}

function openGoalDialog(goal = null) {
  showDialog(goal ? "Edit savings goal" : "Create a savings goal", `<form id="goal-form" data-id="${goal ? escapeHTML(goal.id) : ""}">
    <label>Goal name<input name="name" type="text" value="${escapeHTML(goal?.name || "")}" maxlength="80" required></label>
    <label>Target amount (${escapeHTML(currencyCode())})<input name="target" type="number" min="0.01" step="0.01" value="${goal ? escapeHTML(goal.target) : ""}" required></label>
    <label>Target month<input name="targetMonth" type="month" value="${escapeHTML(goal?.targetMonth || state.month)}" required></label>
    <label>Monthly saving<input name="contribution" type="number" min="0" step="0.01" value="${goal ? escapeHTML(goal.contribution) : "0"}" required></label>
  </form>`, goal ? "Save goal" : "Create goal");
}

function openContributionDialog(goal) {
  showDialog(`Add to ${goal.name}`, `<form id="contribution-form" data-id="${escapeHTML(goal.id)}">
    <label>Contribution (${escapeHTML(currencyCode())})<input name="amount" type="number" min="0.01" max="${Math.max(0, state.dashboard?.balance || 0)}" step="0.01" required></label>
    <p class="dialog-copy">Available balance: ${money(state.dashboard?.balance || 0)}</p>
  </form>`, "Add savings");
}

function openPasswordDialog() {
  showDialog("Change password", `<form id="password-form">
    <label>Current password<input name="currentPassword" type="password" autocomplete="current-password" maxlength="128" required></label>
    <label>New password<input name="newPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label>
    <label>Confirm new password<input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label>
  </form>`, "Update password");
}

async function loadTransactions() {
  const result = await api.transactions({ month: state.month, ...state.filters });
  state.transactions = result.transactions;
}

async function refreshData() {
  if (!state.user) return;
  const [categoriesResult, transactionsResult, dashboard, budgetData, goalsResult] = await Promise.all([
    api.categories(),
    api.transactions({ month: state.month, ...state.filters }),
    api.dashboard(state.month, state.period),
    api.budgets(state.month),
    api.goals(state.month),
  ]);
  state.categories = categoriesResult.categories;
  state.transactions = transactionsResult.transactions;
  state.dashboard = dashboard;
  state.budgetData = budgetData;
  state.goals = goalsResult.goals;
  state.savingsActivity = goalsResult.activity;
}

async function runRequest(task, successMessage = "") {
  try {
    await task();
    if (successMessage) toast(successMessage);
    return true;
  } catch (error) {
    if (error.status === 401) {
      state.user = null;
      render();
      toast("Your session expired. Please sign in again.");
      return false;
    }
    toast(error.message);
    return false;
  }
}

async function handleSubmit(form) {
  const data = new FormData(form);
  if (form.id === "auth-form") {
    const body = Object.fromEntries(data.entries());
    const creatingAccount = state.authMode === "register";
    const result = await runRequest(async () => {
      const response = creatingAccount ? await api.register(body) : await api.login(body);
      state.user = response.user;
      state.authMode = "login";
      await refreshData();
    });
    if (result) {
      render();
      toast(creatingAccount ? "Your account has been created." : "Welcome back.");
    }
    return;
  }

  if (form.id === "transaction-form") {
    const body = {
      description: String(data.get("description")).trim(),
      amount: Number(data.get("amount")),
      type: String(data.get("type")),
      categoryId: Number(data.get("categoryId")),
      date: String(data.get("date")),
    };
    const task = async () => {
      if (form.dataset.id) await api.updateTransaction(form.dataset.id, body);
      else await api.createTransaction(body);
      await refreshData();
    };
    if (await runRequest(task)) {
      closeDialog();
      render();
      toast(form.dataset.id ? "Transaction updated." : "Transaction added.");
    }
    return;
  }

  if (form.id === "goal-form") {
    const body = {
      name: String(data.get("name")).trim(),
      target: Number(data.get("target")),
      targetMonth: String(data.get("targetMonth")),
      contribution: Number(data.get("contribution")),
    };
    const task = async () => {
      if (form.dataset.id) await api.updateGoal(form.dataset.id, body);
      else await api.createGoal(body);
      await refreshData();
    };
    if (await runRequest(task)) {
      closeDialog();
      render();
      toast(form.dataset.id ? "Savings goal updated." : "Savings goal created.");
    }
    return;
  }

  if (form.id === "contribution-form") {
    const task = async () => {
      await api.contributeToGoal(form.dataset.id, { amount: Number(data.get("amount")) });
      await refreshData();
    };
    if (await runRequest(task)) {
      closeDialog();
      render();
      toast("Savings contribution added.");
    }
    return;
  }

  if (form.id === "password-form") {
    const newPassword = String(data.get("newPassword"));
    if (newPassword !== String(data.get("confirmPassword"))) {
      form.elements.confirmPassword.setCustomValidity("Passwords do not match.");
      form.elements.confirmPassword.reportValidity();
      form.elements.confirmPassword.setCustomValidity("");
      return;
    }
    const task = () => api.changePassword({
      currentPassword: String(data.get("currentPassword")),
      newPassword,
    });
    if (await runRequest(task)) {
      closeDialog();
      toast("Password updated.");
    }
    return;
  }

  if (form.id === "budget-form") {
    const body = { month: String(data.get("month")), amount: Number(data.get("amount")) };
    const task = async () => {
      await api.saveBudget(body);
      state.month = body.month;
      persistPreferences();
      await refreshData();
    };
    if (await runRequest(task)) {
      render();
      toast("Monthly budget saved.");
    }
    return;
  }

  if (form.id === "settings-form") {
    const body = {
      name: String(data.get("name")).trim(),
      email: String(data.get("email")).trim(),
      currency: String(data.get("currency")),
    };
    const task = async () => {
      const result = await api.updateProfile(body);
      state.user = result.user;
      state.weeklySummary = data.get("weeklySummary") === "on";
      persistPreferences();
      await refreshData();
    };
    if (await runRequest(task)) {
      render();
      toast("Your settings have been saved.");
    }
    return;
  }

}

function openStatementDialog() {
  const summary = state.dashboard || {};
  showDialog(`${monthName()} statement`, `<div class="statement-totals"><div><span>Income</span><strong>${money(summary.income || 0)}</strong></div><div><span>Expenses</span><strong>${money(summary.expenses || 0)}</strong></div><div><span>Net savings</span><strong>${money(summary.netSavings || 0)}</strong></div></div>
    <p class="dialog-copy">${Number(summary.transactionCount || 0)} recorded transactions for ${escapeHTML(monthName())}.</p>
    <button class="button button-quiet export-data-button" type="button" data-action="export-csv">⇩ Export statement CSV</button>`, "Done");
}

function openDataSummary() {
  showDialog("Your data summary", `<p class="dialog-copy">This account’s data is stored in the connected Pennysaurus database.</p>
    <div class="settings-summary"><span>Transactions this month</span><strong>${Number(state.dashboard?.transactionCount || 0)}</strong></div>
    <div class="settings-summary"><span>Savings goals</span><strong>${state.goals.length}</strong></div>
    <div class="settings-summary"><span>${escapeHTML(monthName())} income</span><strong>${money(state.dashboard?.income || 0)}</strong></div>
    <div class="settings-summary"><span>${escapeHTML(monthName())} expenses</span><strong>${money(state.dashboard?.expenses || 0)}</strong></div>
    <button class="button button-quiet export-data-button" type="button" data-action="export-csv">⇩ Export transactions as CSV</button>`, "Done");
}

async function exportCSV() {
  try {
    const { transactions } = await api.transactions({ month: state.month, sort: "newest" });
    const csv = [["Date", "Description", "Category", "Type", "Amount"], ...transactions.map((item) => [item.date, item.description, item.category, item.type, item.amount])]
      .map((row) => row.map((field) => `"${String(field).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `pennysaurus-transactions-${state.month}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Your CSV export is ready.");
  } catch (error) {
    toast(error.message);
  }
}

async function action(name, element) {
  if (name === "theme") {
    state.theme = state.theme === "dark" ? "light" : "dark";
    persistPreferences();
    render();
  } else if (name === "add-transaction") {
    openTransactionDialog();
  } else if (name === "add-goal") {
    openGoalDialog();
  } else if (name === "edit-transaction") {
    const transaction = state.transactions.find((item) => String(item.id) === element.dataset.id);
    if (transaction) openTransactionDialog(transaction);
  } else if (name === "delete-transaction") {
    if (!window.confirm("Delete this transaction? This cannot be undone.")) return;
    const task = async () => {
      await api.deleteTransaction(element.dataset.id);
      await refreshData();
    };
    if (await runRequest(task)) {
      render();
      toast("Transaction deleted.");
    }
  } else if (name === "edit-goal") {
    const goal = state.goals.find((item) => String(item.id) === element.dataset.id);
    if (goal) openGoalDialog(goal);
  } else if (name === "delete-goal") {
    if (!window.confirm("Delete this savings goal and its activity? This cannot be undone.")) return;
    const task = async () => {
      await api.deleteGoal(element.dataset.id);
      await refreshData();
    };
    if (await runRequest(task)) {
      render();
      toast("Savings goal deleted.");
    }
  } else if (name === "contribute") {
    const goal = state.goals.find((item) => String(item.id) === element.dataset.id);
    if (goal) openContributionDialog(goal);
  } else if (name === "period") {
    state.period = state.period === "year" ? "six-months" : "year";
    persistPreferences();
    if (await runRequest(refreshData)) render();
  } else if (name === "save-categories") {
    const inputs = [...document.querySelectorAll("[data-category-budget]")];
    const values = inputs.map((input) => ({ id: Number(input.dataset.categoryBudget), amount: Number(input.value) }));
    if (values.some((item) => !Number.isFinite(item.amount) || item.amount <= 0)) {
      toast("Enter a category limit greater than zero for each category.");
      return;
    }
    const task = async () => {
      await Promise.all(values.map((item) => api.saveCategoryBudget(item.id, { month: state.month, amount: item.amount })));
      await refreshData();
    };
    if (await runRequest(task)) {
      render();
      toast("Category limits saved.");
    }
  } else if (name === "statement") {
    openStatementDialog();
  } else if (name === "data-summary") {
    openDataSummary();
  } else if (name === "password") {
    openPasswordDialog();
  } else if (name === "export-csv") {
    await exportCSV();
  } else if (name === "notifications") {
    const popover = document.querySelector("#notification-popover");
    popover.hidden = !popover.hidden;
    element.setAttribute("aria-expanded", String(!popover.hidden));
  } else if (name === "sign-out") {
    if (await runRequest(() => api.logout())) {
      state.user = null;
      state.categories = [];
      state.transactions = [];
      state.dashboard = null;
      state.budgetData = null;
      render();
      toast("You have signed out.");
    }
  } else if (name === "toggle-auth") {
    state.authMode = state.authMode === "login" ? "register" : "login";
    render();
  } else if (name === "close-dialog") {
    closeDialog();
  } else if (name === "retry") {
    await start();
  }
}

async function start() {
  state.connectionError = "";
  try {
    const session = await api.session();
    state.user = session.user;
    if (state.user) await refreshData();
    render();
  } catch (error) {
    state.connectionError = error.message || "Unable to connect to the server.";
    render();
  }
}

document.addEventListener("click", async (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const pageButton = target.closest("[data-page]");
  if (pageButton) {
    state.currentPage = pageButton.dataset.page;
    persistPreferences();
    render();
    return;
  }
  const control = target.closest("[data-action]");
  if (control) {
    await action(control.dataset.action, control);
    return;
  }
  if (target.matches("dialog")) closeDialog();
});

document.addEventListener("input", (event) => {
  if (!event.target.matches('[data-filter="search"]')) return;
  state.filters.search = event.target.value;
  clearTimeout(filterTimeout);
  filterTimeout = setTimeout(async () => {
    if (await runRequest(loadTransactions)) render();
  }, 250);
});

document.addEventListener("change", async (event) => {
  const target = event.target;
  if (target.matches("[data-filter]")) {
    state.filters[target.dataset.filter] = target.value;
    if (await runRequest(loadTransactions)) render();
  }
  if (target.matches('[data-action="month"]')) {
    state.month = target.value;
    persistPreferences();
    if (await runRequest(refreshData)) render();
  }
});

document.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.reportValidity()) return;
  await handleSubmit(form);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeDialog();
    const popover = document.querySelector("#notification-popover");
    if (popover) popover.hidden = true;
  }
});

start();
setInterval(async () => {
  if (!state.user) return;
  try {
    await refreshData();
    if (["overview", "reports"].includes(state.currentPage)) render();
  } catch (error) {
    toast(`Live refresh failed: ${error.message}`);
  }
}, 60_000);
