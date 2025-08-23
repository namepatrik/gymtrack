/*
  GymTrack • charts.js
  Small helpers to render/destroy Chart.js line charts consistently.
  Requires Chart.js UMD loaded globally (chart.umd.min.js).
*/

let _charts = new Map();

export function renderLineChart(canvasId, labels, data, yLabel=''){
  const ctx = document.getElementById(canvasId).getContext('2d');
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
        fill: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx)=> `${ctx.parsed.y}` } }
      },
      scales: {
        x: { ticks: { autoSkip: true, maxTicksLimit: 6 } },
        y: { beginAtZero: true, ticks: { precision: 0 } }
      }
    }
  });
  _charts.set(canvasId, chart);
  return chart;
}

export function destroyChart(chart){ if(chart){ chart.destroy(); }
}
