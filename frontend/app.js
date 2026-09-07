const DATA_ROOT = '../gis/';
const LAYER_DEFINITIONS = [
  { key: 'risk_zones', label: 'Risk zones', className: 'risk' },
  { key: 'villages', label: 'Villages & settlements', className: 'villages' },
  { key: 'roads', label: 'Road network', className: 'roads' },
  { key: 'bridges', label: 'Bridges', className: 'bridges' },
  { key: 'infrastructure', label: 'Critical infrastructure', className: 'infrastructure' },
  { key: 'vegetation', label: 'Vegetation density', className: 'vegetation' },
  { key: 'sensors', label: 'Sensor locations', className: 'sensors' },
  { key: 'terrain', label: 'Terrain samples', className: 'terrain' },
];

const map = L.map('map', { zoomControl: false, attributionControl: false }).setView([20.5937, 78.9629], 4);
L.control.zoom({ position: 'bottomright' }).addTo(map);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map);

const layerGroups = new Map();
const layerData = new Map();
const elements = {
  areaInput: document.querySelector('#area-input'),
  areaButton: document.querySelector('#area-button'),
  bboxButton: document.querySelector('#bbox-button'),
  areaTitle: document.querySelector('#area-title'),
  areaChip: document.querySelector('#area-chip'),
  notice: document.querySelector('#notice'),
  totalCount: document.querySelector('#total-count'),
  populationTotal: document.querySelector('#population-total'),
  infrastructureTotal: document.querySelector('#infrastructure-total'),
  vegetationTotal: document.querySelector('#vegetation-total'),
  densityList: document.querySelector('#density-list'),
  layerList: document.querySelector('#layer-list'),
  lastUpdated: document.querySelector('#last-updated'),
  feedCopy: document.querySelector('#feed-copy'),
};

function showNotice(message = '') {
  elements.notice.textContent = message;
}

function readBbox() {
  const values = ['west', 'south', 'east', 'north'].map((id) => Number(document.querySelector(`#${id}`).value));
  if (values.some((value) => Number.isNaN(value))) throw new Error('Enter all four bounds before applying the area.');
  const [west, south, east, north] = values;
  if (!(west < east && south < north && west >= -180 && east <= 180 && south >= -90 && north <= 90)) {
    throw new Error('Bounds must be valid WGS84 coordinates: west < east and south < north.');
  }
  return values;
}

function setBboxInputs(bbox) {
  ['west', 'south', 'east', 'north'].forEach((id, index) => { document.querySelector(`#${id}`).value = bbox[index].toFixed(5); });
}

function fitToBbox(bbox) {
  const [west, south, east, north] = bbox;
  map.fitBounds([[south, west], [north, east]], { padding: [30, 30] });
}

async function findArea() {
  const query = elements.areaInput.value.trim();
  if (!query) throw new Error('Enter a place name to search.');
  elements.areaButton.disabled = true;
  elements.areaButton.firstElementChild.textContent = 'Searching...';
  const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`, { headers: { 'Accept-Language': 'en', 'User-Agent': 'SlopeGuard-Frontend/1.0' } });
  if (!response.ok) throw new Error('The geocoding service is unavailable right now.');
  const results = await response.json();
  if (!results.length) throw new Error(`No location found for “${query}”. Try a more specific name.`);
  const [south, north, west, east] = results[0].boundingbox.map(Number);
  const bbox = [west, south, east, north];
  setBboxInputs(bbox);
  fitToBbox(bbox);
  elements.areaTitle.textContent = results[0].display_name.split(',').slice(0, 2).join(',');
  elements.areaChip.textContent = 'AREA FOUND';
  await loadLayers(bbox);
}

async function loadGeoJson(layer) {
  const response = await fetch(`${DATA_ROOT}${layer.key}.geojson?ts=${Date.now()}`);
  if (!response.ok) throw new Error(`Could not load ${layer.label}.`);
  return response.json();
}

function styleFor(key) {
  const colors = { risk_zones: '#e5784d', villages: '#426b4d', roads: '#9b8966', bridges: '#e6ba4f', infrastructure: '#d68b48', vegetation: '#2f8f5b', sensors: '#4f91a3', terrain: '#7c9d72' };
  if (key === 'risk_zones') {
    return { color: '#b9362b', weight: 4, fillColor: '#ef5b45', fillOpacity: .52, opacity: 1 };
  }
  return { color: colors[key] || '#426b4d', weight: key === 'roads' ? 2 : 3, fillOpacity: .26, opacity: .8 };
}

function featureStyle(key, feature) {
  if (key !== 'vegetation') return styleFor(key);
  const density = feature.properties?.vegetation_density;
  const colors = { high: '#146b3a', medium: '#2f8f5b', low: '#82b366' };
  const color = colors[density] || colors.medium;
  return { color, fillColor: color, weight: 2, fillOpacity: density === 'high' ? .5 : .34, opacity: .9 };
}

function populationFromVillages(data) {
  return (data?.features || []).reduce((total, feature) => {
    const value = feature.properties?.population;
    if (value === undefined || value === null || value === '') return total;
    const population = Number(String(value).replace(/,/g, '').trim());
    return Number.isFinite(population) && population >= 0 ? total + population : total;
  }, 0);
}

function formatPopulation(population, hasPopulationData) {
  if (!hasPopulationData) return '—';
  return population.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function renderDensityArrangement(data) {
  const counts = { high: 0, medium: 0, low: 0 };
  (data?.features || []).forEach((feature) => {
    const density = feature.properties?.vegetation_density;
    if (density in counts) counts[density] += 1;
  });
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  elements.vegetationTotal.textContent = total.toLocaleString('en-IN');
  elements.densityList.innerHTML = Object.entries(counts).map(([density, count]) => {
    const percentage = total ? Math.round((count / total) * 100) : 0;
    return `<div class="density-row"><div class="density-label"><i class="density-dot ${density}"></i><span>${density}</span><strong>${percentage}%</strong></div><div class="density-track"><span class="density-fill ${density}" style="width: ${percentage}%"></span></div><span class="density-count">${count.toLocaleString('en-IN')}</span></div>`;
  }).join('');
}

function renderLayerList() {
  elements.layerList.innerHTML = LAYER_DEFINITIONS.map((layer) => {
    const count = layerData.get(layer.key)?.features?.length || 0;
    return `<div class="layer-row"><input class="layer-toggle" id="toggle-${layer.key}" type="checkbox" checked data-layer="${layer.key}"><label class="layer-label" for="toggle-${layer.key}"><i class="layer-dot ${layer.className}"></i><span>${layer.label}</span></label><span class="layer-count">${count.toString().padStart(2, '0')}</span><span class="layer-status"></span></div>`;
  }).join('');
  elements.layerList.querySelectorAll('.layer-toggle').forEach((toggle) => toggle.addEventListener('change', () => {
    const group = layerGroups.get(toggle.dataset.layer);
    if (toggle.checked) group?.addTo(map); else group?.remove();
  }));
  elements.totalCount.textContent = [...layerData.values()].reduce((total, data) => total + (data.features?.length || 0), 0).toString().padStart(2, '0');
  const villages = layerData.get('villages');
  const population = populationFromVillages(villages);
  const hasPopulationData = (villages?.features || []).some((feature) => {
    const value = feature.properties?.population;
    return value !== undefined && value !== null && value !== '' && Number.isFinite(Number(String(value).replace(/,/g, '').trim()));
  });
  elements.populationTotal.textContent = formatPopulation(population, hasPopulationData);
  elements.infrastructureTotal.textContent = (layerData.get('infrastructure')?.features?.length || 0).toLocaleString('en-IN');
  renderDensityArrangement(layerData.get('vegetation'));
}

async function loadLayers(bbox) {
  showNotice('');
  elements.lastUpdated.textContent = 'LOADING LAYERS';
  const results = await Promise.all(LAYER_DEFINITIONS.map(async (layer) => [layer.key, await loadGeoJson(layer)]));
  layerData.clear();
  layerGroups.forEach((group) => group.remove());
  layerGroups.clear();
  results.forEach(([key, data]) => {
    layerData.set(key, data);
    const group = L.geoJSON(data, { style: (feature) => featureStyle(key, feature), pointToLayer: (feature, latlng) => L.circleMarker(latlng, { ...featureStyle(key, feature), radius: 6 }) }).bindPopup((feature) => `<strong>${feature.properties?.name || feature.properties?.amenity || key}</strong><br><small>${feature.properties?.vegetation_density ? `Density: ${feature.properties.vegetation_density}<br>` : ''}Source: ${feature.properties?.source || 'GeoJSON layer'}</small>`);
    layerGroups.set(key, group);
    group.addTo(map);
  });
  layerGroups.get('risk_zones')?.bringToFront();
  layerGroups.get('vegetation')?.bringToBack();
  renderLayerList();
  fitToBbox(bbox);
  elements.lastUpdated.textContent = `UPDATED ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  elements.feedCopy.textContent = 'Layers are loaded from the GIS output contract. Empty counts are expected until the selected area has been fetched and processed.';
}

async function handle(action) {
  try {
    await action();
  } catch (error) {
    showNotice(error.message);
  } finally {
    elements.areaButton.disabled = false;
    elements.areaButton.firstElementChild.textContent = 'Find area';
  }
}

elements.areaButton.addEventListener('click', () => handle(findArea));
elements.areaInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') handle(findArea); });
elements.bboxButton.addEventListener('click', () => handle(async () => {
  const bbox = readBbox();
  setBboxInputs(bbox);
  fitToBbox(bbox);
  elements.areaTitle.textContent = 'Custom operating area';
  elements.areaChip.textContent = 'BBOX ACTIVE';
  await loadLayers(bbox);
}));

renderLayerList();
