const grid = document.querySelector('#station-grid');
const feedStatus = document.querySelector('#feed-status');
const lastUpdated = document.querySelector('#last-updated');
const liveIndicator = document.querySelector('.live-indicator');
const clock = document.querySelector('#current-time');

const displayTime = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true,
});
const currentTime = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
});

const routeGroups = {
  A: 'blue', C: 'blue', E: 'blue',
  B: 'orange', D: 'orange', F: 'orange', M: 'orange',
  G: 'lime', J: 'brown', Z: 'brown', L: 'gray',
  N: 'yellow', Q: 'yellow', R: 'yellow', W: 'yellow',
  1: 'red', 2: 'red', 3: 'red',
  4: 'green', 5: 'green', 6: 'green',
  7: 'purple', S: 'gray', SI: 'blue',
};

function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function countdown(arrivesAt) {
  const remaining = Math.max(0, Math.ceil((Date.parse(arrivesAt) - Date.now()) / 1000));
  if (remaining < 30) return 'Due';
  return `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
}

function renderStation(id, station) {
  const section = element('section', 'station');
  section.setAttribute('aria-label', `${station.name}, ${station.direction || id}`);
  const header = element('div', 'station-heading');
  const titleArea = element('div', 'station-title');
  titleArea.append(element('span', 'station-title-icon', '↓'));
  const label = element('div');
  label.append(element('h2', '', station.name));
  label.append(element('span', 'direction', station.direction || 'Subway platform'));
  titleArea.append(label);
  header.append(titleArea, element('span', 'platform-id', id));
  section.append(header);

  if (!station.trains.length) {
    section.append(element('p', 'empty', 'No upcoming arrivals reported.'));
    return section;
  }
  for (const train of station.trains) {
    const row = element('div', 'arrival');
    const details = element('div', 'arrival-details');
    const badge = element('span', 'route', train.trainId);
    badge.dataset.group = routeGroups[train.trainId.toUpperCase()] || 'gray';
    badge.setAttribute('aria-label', `Route ${train.trainId}`);
    const timeInfo = element('div');
    timeInfo.append(element('span', 'line-caption', 'EXPECTED AT'));
    timeInfo.append(element('div', 'arrival-time', displayTime.format(new Date(train.arrivesAt))));
    details.append(badge, timeInfo);

    const eta = element('div', 'eta');
    const ticker = element('span', 'countdown', countdown(train.arrivesAt));
    ticker.dataset.arrivesAt = train.arrivesAt;
    eta.append(ticker, element('span', 'in-label', 'Until arrival'));
    row.append(details, eta);
    section.append(row);
  }
  return section;
}

function render(data) {
  const fragment = document.createDocumentFragment();
  for (const [id, station] of Object.entries(data.stations || {})) {
    fragment.append(renderStation(id, station));
  }
  grid.replaceChildren(fragment);
  const failedCount = data.feeds?.failed?.length || 0;
  liveIndicator.classList.toggle('problem', data.status !== 'ok');
  feedStatus.textContent = data.status === 'ok' ? 'LIVE · MTA FEEDS CONNECTED'
    : data.status === 'partial' ? `PARTIAL DATA · ${failedCount} FEED${failedCount === 1 ? '' : 'S'} UNAVAILABLE`
      : 'MTA FEEDS UNAVAILABLE';
  lastUpdated.textContent = `Updated ${displayTime.format(new Date(data.fetchedAt))}`;
}

let polling = false;
let lastSnapshot = null;
async function refresh() {
  if (polling) return;
  polling = true;
  try {
    const response = await fetch('/api/arrivals', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok && data.status !== 'error') throw new Error(`HTTP ${response.status}`);
    // Preserve the last working board through a total feed outage.
    if (data.status === 'error' && lastSnapshot) {
      feedStatus.textContent = 'MTA UNAVAILABLE · SHOWING LAST RESULTS';
      liveIndicator.classList.add('problem');
      lastUpdated.textContent = 'Previous predictions may be outdated';
    } else {
      if (data.status !== 'error') lastSnapshot = data;
      render(data);
    }
  } catch (error) {
    console.error('Could not refresh subway arrivals', error);
    feedStatus.textContent = 'CONNECTION LOST · RETRYING';
    liveIndicator.classList.add('problem');
  } finally {
    polling = false;
  }
}

function tick() {
  clock.textContent = currentTime.format(new Date());
  for (const ticker of grid.querySelectorAll('[data-arrives-at]')) {
    ticker.textContent = countdown(ticker.dataset.arrivesAt);
  }
}

refresh();
tick();
setInterval(refresh, 20_000);
setInterval(tick, 1_000);
