const ANALYSIS_TODAY = toStartOfDay(new Date());
const DEFAULT_DUE_DATE = toStartOfDay(new Date('2025-12-22'));

const AGE_GROUP_OPTIONS = [
  { value: '<20', label: 'Under 20', description: 'Teens' },
  { value: '20-29', label: '20 – 29', description: 'Twenties' },
  { value: '30-39', label: '30 – 39', description: 'Thirties' },
  { value: '40+', label: '40 and up', description: 'Forties+' },
];

const PARITY_OPTIONS = [
  { value: 'primipara', label: 'First birth', description: 'Primipara' },
  { value: 'multipara', label: 'Previous birth', description: 'Multipara' },
];

const DATE_DISPLAY = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
const DATE_SHORT = new Intl.DateTimeFormat('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });

let weightsData = null;
const toast = document.getElementById('toast');

const state = {
  ageGroup: '30-39',
  parity: 'primipara',
  dueDate: DEFAULT_DUE_DATE,
  snapshot: null,
};

init();

async function init() {
  const urlConfig = readUrlConfig();
  state.ageGroup = urlConfig.ageGroup ?? state.ageGroup;
  state.parity = urlConfig.parity ?? state.parity;
  state.dueDate = urlConfig.dueDate ?? state.dueDate;

  try {
    const response = await fetch('./weights.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Failed to load weights.json (${response.status})`);
    weightsData = await response.json();
  } catch (error) {
    console.error(error);
    showToast('Unable to load data');
    return;
  }

  mountControls();
  attachEvents();
  recomputeSnapshot();
}

function mountControls() {
  const dueInput = document.getElementById('due-date');
  dueInput.value = formatInputDateValue(state.dueDate);

  renderPills(document.getElementById('age-group-options'), AGE_GROUP_OPTIONS, state.ageGroup, (value) => {
    state.ageGroup = value;
    recomputeSnapshot();
  });

  renderPills(document.getElementById('parity-options'), PARITY_OPTIONS, state.parity, (value) => {
    state.parity = value;
    recomputeSnapshot();
  });
}

function attachEvents() {
  const dueInput = document.getElementById('due-date');
  dueInput.addEventListener('change', (event) => {
    const next = parseInputDate(event.target.value);
    if (!next) return;
    state.dueDate = next;
    recomputeSnapshot();
  });

  const shareButton = document.getElementById('share-button');
  shareButton.addEventListener('click', () => {
    const path = syncUrlState(state.dueDate, state.ageGroup, state.parity);
    if (!path) {
      showToast('Unable to share link');
      return;
    }

    const fullUrl = `${window.location.origin}${path}`;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard
        .writeText(fullUrl)
        .then(() => showToast('Link copied to clipboard'))
        .catch(() => showToast('Unable to copy link'));
    } else {
      showToast('Copy not available on this browser');
    }
  });
}

function recomputeSnapshot() {
  if (!weightsData) return;

  state.snapshot = buildProbabilitySnapshot({
    dueDate: state.dueDate,
    ageGroup: state.ageGroup,
    parity: state.parity,
    today: ANALYSIS_TODAY,
    data: weightsData,
  });

  syncUrlState(state.dueDate, state.ageGroup, state.parity);
  renderUI();
}

function renderUI() {
  updateWindowCopy(state.snapshot);
  renderSnapshotCards(state.snapshot);
  renderWeeklyTable(state.snapshot);

  const currentWeekLabel = document.getElementById('current-week-label');
  currentWeekLabel.textContent = `Week ${state.snapshot.currentWeek} highlighted`;
}

function updateWindowCopy(snapshot) {
  const minDate = snapshot.daily[0]?.date ?? ANALYSIS_TODAY;
  const maxDate = snapshot.daily[snapshot.daily.length - 1]?.date ?? ANALYSIS_TODAY;
  const windowCopy = document.getElementById('window-copy');
  windowCopy.textContent = `Modeled window spans ${formatDisplayDate(minDate)} through ${formatDisplayDate(
    maxDate,
  )}, ending 33 days after the due date.`;
}

function renderSnapshotCards(snapshot) {
  const todayRow = snapshot.daily.find((row) => sameDay(row.date, ANALYSIS_TODAY));
  const peakRow = snapshot.daily
    .filter((row) => row.normalizedProbability > 0)
    .reduce((highest, row) => {
      if (!highest || row.normalizedProbability > highest.normalizedProbability) {
        return row;
      }
      return highest;
  }, null);
  const upcomingRow = findClosestFutureDate(snapshot, ANALYSIS_TODAY);
  const weeklyWindow = snapshot.weekly.filter((row) => row.week >= 30 && row.week <= 46);
  const totalWeeklyWeight = weeklyWindow.reduce((acc, row) => acc + row.weeklyWeight, 0);
  const currentWeekRow = weeklyWindow.find((row) => row.week === snapshot.currentWeek);
  const currentWeekTailShare =
    currentWeekRow && currentWeekRow.normalizedProbability ? currentWeekRow.normalizedProbability : null;

  const cards = [
    {
      label: 'Current gestational week',
      value: String(snapshot.currentWeek),
      hint: `Aligned to ${formatDisplayDate(ANALYSIS_TODAY)}`,
    },
    {
      label: 'Probability today',
      value: formatPercent(todayRow?.normalizedProbability ?? 0, 2),
      hint: todayRow ? `${formatPercent(todayRow.dailyWeight, 2)} of weekly volume` : 'No data',
      accent:
        currentWeekTailShare !== null ? `${formatPercent(currentWeekTailShare, 2)} tail share` : null,
    },
    {
      label: 'Most likely upcoming day',
      value: peakRow ? formatPercent(peakRow.normalizedProbability, 2) : '0%',
      hint: peakRow ? formatDisplayDate(peakRow.date) : 'No remaining days',
    },
    {
      label: 'Next non-zero day',
      value: upcomingRow ? formatDisplayDate(upcomingRow.date) : 'Complete',
      hint: upcomingRow ? `Probability ${formatPercent(upcomingRow.normalizedProbability, 2)}` : 'All probability consumed',
    },
  ];

  const grid = document.getElementById('snapshot-grid');
  grid.innerHTML = '';
  for (const card of cards) {
    const section = document.createElement('section');
    section.className = 'snapshot-card';

    const title = document.createElement('h3');
    title.textContent = card.label;
    section.appendChild(title);

    const value = document.createElement('strong');
    value.textContent = card.value;
    section.appendChild(value);

    if (card.hint) {
      const hint = document.createElement('p');
      hint.textContent = card.hint;
      section.appendChild(hint);
    }

    if (card.accent && card.hint !== 'No data') {
      const accent = document.createElement('p');
      accent.className = 'accent';
      accent.textContent = card.accent;
      section.appendChild(accent);
    }

    grid.appendChild(section);
  }
}

function renderWeeklyTable(snapshot) {
  const tbody = document.getElementById('weekly-table-body');
  tbody.innerHTML = '';

  const rows = snapshot.weekly.filter((row) => row.week >= 30 && row.week <= 46);
  const totalWeight = rows.reduce((acc, row) => acc + row.weeklyWeight, 0);

  for (const row of rows) {
    const tr = document.createElement('tr');
    if (row.week === snapshot.currentWeek) {
      tr.classList.add('is-current');
    }

    tr.appendChild(makeCell(() => {
      const cell = document.createElement('td');
      const dot = document.createElement('span');
      dot.className = 'week-dot';
      cell.appendChild(dot);
      cell.appendChild(document.createTextNode(String(row.week)));
      return cell;
    }));

    tr.appendChild(makeCell(() => {
      const cell = document.createElement('td');
      const normalizedShare = totalWeight === 0 ? 0 : row.weeklyWeight / totalWeight;
      cell.textContent = formatPercent(normalizedShare, 2);
      return cell;
    }));

    tr.appendChild(makeCell(() => {
      const cell = document.createElement('td');
      cell.textContent = formatPercent(row.normalizedProbability, 2);
      return cell;
    }));

    tr.appendChild(makeCell(() => {
      const cell = document.createElement('td');
      cell.textContent = formatPercent(row.cumulativeShare, 2);
      return cell;
    }));

    tr.appendChild(makeCell(() => {
      const cell = document.createElement('td');
      cell.textContent = formatUsDate(row.weekStartDate);
      return cell;
    }));

    tbody.appendChild(tr);
  }
}

function makeCell(factory) {
  return factory();
}

function renderPills(container, options, activeValue, onSelect) {
  container.innerHTML = '';
  for (const option of options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pill';
    if (option.value === activeValue) {
      button.classList.add('is-active');
    }

    const title = document.createElement('span');
    title.className = 'pill__title';
    title.textContent = option.label;
    button.appendChild(title);

    if (option.description) {
      const hint = document.createElement('span');
      hint.className = 'pill__hint';
      hint.textContent = option.description;
      button.appendChild(hint);
    }

    button.addEventListener('click', () => {
      if (option.value === activeValue) return;
      onSelect(option.value);
      renderPills(container, options, option.value, onSelect);
    });

    container.appendChild(button);
  }
}

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('is-visible');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.classList.remove('is-visible');
  }, 2400);
}

function readUrlConfig() {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);

  const config = {};
  const age = params.get('age');
  const parity = params.get('parity');
  const due = params.get('due');

  if (AGE_GROUP_OPTIONS.some((option) => option.value === age)) {
    config.ageGroup = age;
  }

  if (PARITY_OPTIONS.some((option) => option.value === parity)) {
    config.parity = parity;
  }

  if (due) {
    const parsed = parseInputDate(due);
    if (parsed) {
      config.dueDate = parsed;
    }
  }

  return config;
}

function syncUrlState(dueDate, ageGroup, parity) {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams();
  params.set('due', formatInputDateValue(dueDate));
  params.set('age', ageGroup);
  params.set('parity', parity);
  const query = params.toString();
  const newUrl = `${window.location.pathname}?${query}${window.location.hash}`;
  window.history.replaceState(null, '', newUrl);
  return newUrl;
}

function buildProbabilitySnapshot({ dueDate, ageGroup, parity, today, data }) {
  const curve = getCurve(data, ageGroup, parity);

  const weekly = buildWeeklyTable({ dueDate, curve, today, weeks: data.weeks });
  const dailyResult = buildDailyTable({
    dueDate,
    curve,
    today,
    weeks: data.weeks,
    postpartumLimitDays: 33,
  });

  const probabilityMap = new Map();
  for (const row of dailyResult.daily) {
    probabilityMap.set(row.date.toISOString(), row.normalizedProbability);
  }

  return {
    weekly,
    daily: dailyResult.daily,
    currentWeek: computeCurrentWeek(dueDate, today),
    probabilityForDate(date) {
      const key = toStartOfDay(date).toISOString();
      return probabilityMap.get(key) ?? 0;
    },
    tailMass: dailyResult.tailMass,
  };
}

function getCurve(data, ageGroup, parity) {
  return data.curves_by_age_parity[ageGroup][parity].slice();
}

function buildWeeklyTable({ dueDate, curve, today, weeks }) {
  let cumulative = 0;
  const totalWeight = curve.reduce((acc, value) => acc + value, 0);
  const currentWeek = computeCurrentWeek(dueDate, today);

  const tailWeights = weeks.reduce((acc, week, index) => {
    if (week >= currentWeek) {
      return acc + curve[index];
    }
    return acc;
  }, 0);

  return weeks.map((week, index) => {
    const weeklyWeight = curve[index];
    cumulative += weeklyWeight;
    const weekStartDate = addDays(toStartOfDay(dueDate), (week - 40) * 7);
    const normalizedProbability = week < currentWeek || tailWeights === 0 ? 0 : weeklyWeight / tailWeights;

    return {
      week,
      weeklyWeight,
      cumulativeWeight: cumulative,
      normalizedProbability,
      weekStartDate,
      cumulativeShare: totalWeight === 0 ? 0 : cumulative / totalWeight,
    };
  });
}

function buildDailyTable({ dueDate, curve, today, weeks, postpartumLimitDays }) {
  const rows = [];
  let cumulative = 0;
  const dueAtStart = toStartOfDay(dueDate);
  const cutoffDate = addDays(dueAtStart, postpartumLimitDays);

  for (let index = 0; index < weeks.length; index += 1) {
    const week = weeks[index];
    const weekWeight = curve[index];
    const dayWeight = weekWeight / 7;
    const weekStartDate = addDays(dueAtStart, (week - 40) * 7);

    for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
      const date = addDays(weekStartDate, dayOffset);
      if (isAfter(date, cutoffDate)) {
        continue;
      }

      cumulative += dayWeight;
      rows.push({
        date,
        week,
        dailyWeight: dayWeight,
        cumulativeWeight: cumulative,
        normalizedProbability: 0,
        cumulativeNormalized: 0,
      });
    }
  }

  const todayStart = toStartOfDay(today);
  const tailMass = rows
    .filter((row) => !isBefore(row.date, todayStart))
    .reduce((acc, row) => acc + row.dailyWeight, 0);

  let runningTail = 0;
  for (const row of rows) {
    if (isBefore(row.date, todayStart)) {
      row.normalizedProbability = 0;
      row.cumulativeNormalized = 0;
      continue;
    }

    if (tailMass === 0) {
      row.normalizedProbability = 0;
      row.cumulativeNormalized = 0;
      continue;
    }

    row.normalizedProbability = row.dailyWeight / tailMass;
    runningTail += row.dailyWeight;
    row.cumulativeNormalized = runningTail / tailMass;
  }

  return { daily: rows, tailMass };
}

function findClosestFutureDate(probability, from) {
  const target = toStartOfDay(from);
  return probability.daily.find(
    (row) => !isBefore(row.date, target) && (row.normalizedProbability > 0 || sameDay(row.date, target)),
  );
}

function computeCurrentWeek(dueDate, today) {
  const diffWeeks = differenceInCalendarWeeks(toStartOfDay(dueDate), toStartOfDay(today));
  const rawWeek = 40 - diffWeeks;
  const rounded = Math.round(rawWeek);
  if (Number.isNaN(rounded)) return 20;
  return Math.min(Math.max(rounded, 20), 46);
}

function differenceInCalendarWeeks(dateLeft, dateRight) {
  const startLeft = startOfWeek(dateLeft);
  const startRight = startOfWeek(dateRight);
  const diffMs = startLeft.getTime() - startRight.getTime();
  return Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
}

function startOfWeek(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  const day = result.getDay();
  result.setDate(result.getDate() - day);
  return result;
}

function addDays(date, amount) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function toStartOfDay(value) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function parseInputDate(value) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return null;
  return toStartOfDay(date);
}

function formatInputDateValue(date) {
  return toStartOfDay(date).toISOString().slice(0, 10);
}

function formatDisplayDate(date) {
  return DATE_DISPLAY.format(date);
}

function formatUsDate(date) {
  return DATE_SHORT.format(date);
}

function formatPercent(value, decimals = 2) {
  if (!Number.isFinite(value)) return '0%';
  return `${(value * 100).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
}

function sameDay(dateA, dateB) {
  return dateA.getTime() === dateB.getTime();
}

function isBefore(dateA, dateB) {
  return dateA.getTime() < dateB.getTime();
}

function isAfter(dateA, dateB) {
  return dateA.getTime() > dateB.getTime();
}
