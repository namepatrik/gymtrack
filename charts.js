/*
  GymTrack • charts.js
  Line chart helpers with dark/light theme colors pulled from CSS variables.
  Requires Chart.js UMD loaded globally (chart.umd.min.js).
*/

let _charts = new Map();

function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function renderLineChart(canvasId, labels, data, yLabel = '') {
  const ctx = document.getElementById(canvasId).getContext('2d');

  // Theme colors from CSS vars
  const colorText = cssVar('--text', '#222');
  const colorMuted = cssVar('--muted', '#6b7480');
  const colorPrimary = cssVar('--primary', '#4c7df0');
  const gridColor = rgbaFromHex(colorMuted, 0.25);

  destroyChart(_charts.get(canvasId));

  const chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: yLabel,
        data,
        tension: 0.25,
        pointRadius: 3,
        pointHoverRadius: 5,
        borderWidth: 2,
        borderColor: colorPrimary,
        pointBackgroundColor: colorPrimary,
        fill: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          titleColor: colorText,
          bodyColor: colorText,
          backgroundColor: rgbaFromHex('#000', 0.7),
          callbacks: { label: (ctx) => `${ctx.parsed.y}` }
        }
      },
      scales: {
        x: {
          ticks: { autoSkip: true, maxTicksLimit: 6, color: colorText },
          grid: { color: gridColor }
        },
        y: {
          beginAtZero: true,
          ticks: { precision: 0, color: colorText },
          grid: { color: gridColor }
        }
      }
    }
  });

  _charts.set(canvasId, chart);
  return chart;
}

export function destroyChart(chart) {
  if (chart) chart.destroy();
}

// Small helper to turn a hex color into rgba string with alpha
function rgbaFromHex(hex, alpha = 1) {
  const h = hex.replace('#', '').trim();
  if (h.length === 3) {
    const r = parseInt(h[0] + h[0], 16), g = parseInt(h[1] + h[1], 16), b = parseInt(h[2] + h[2], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (h.length >= 6) {
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return `rgba(0,0,0,${alpha})`;
}
