import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChartConfiguration, ChartData, ChartType, TooltipItem } from 'chart.js';
import { NgChartsModule } from 'ng2-charts';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, NgChartsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  private readonly http = inject(HttpClient);

  title = 'Time Tracker';

  // Use direct Azure URL in local dev; use serverless proxy in production to avoid CORS
  readonly apiUrl = (typeof window !== 'undefined' && window.location.hostname === 'localhost')
    ? 'https://rc-vault-fap-live-1.azurewebsites.net/api/gettimeentries?code=vO17RnE8vuzXzPJo5eaLLjXjmRW07law99QTD90zat9FfOQJKKUcgQ=='
    : '/api/time-entries';

  // Raw entries
  readonly entriesSignal = signal<TimeEntry[]>([]);
  readonly loadingSignal = signal<boolean>(true);
  readonly errorSignal = signal<string | null>(null);

  // Aggregated totals by employee name in hours
  readonly totalsByEmployeeSignal = computed<AggregatedTotal[]>(() => {
    const entries = this.entriesSignal();
    const totalsMap = new Map<string, number>();

    for (const entry of entries) {
      if (!entry.EmployeeName) continue;
      // Skip logically deleted entries
      if (entry.DeletedOn) continue;

      const start = new Date(entry.StarTimeUtc);
      const end = new Date(entry.EndTimeUtc);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) continue;

      // Some entries may have end before start; clamp at 0
      const ms = Math.max(0, end.getTime() - start.getTime());
      const hours = ms / (1000 * 60 * 60);

      totalsMap.set(entry.EmployeeName, (totalsMap.get(entry.EmployeeName) ?? 0) + hours);
    }

    const totals: AggregatedTotal[] = Array.from(totalsMap.entries()).map(([name, totalHours]) => ({
      name,
      totalHours
    }));

    // Sort descending by total time worked
    totals.sort((a, b) => b.totalHours - a.totalHours);
    return totals;
  });

  readonly grandTotalHoursSignal = computed<number>(() =>
    this.totalsByEmployeeSignal().reduce((sum, r) => sum + r.totalHours, 0)
  );

  // Chart config
  readonly pieChartLabelsSignal = computed<string[]>(() => this.totalsByEmployeeSignal().map(r => r.name));
  readonly pieChartDataSignal = computed<number[]>(() => this.totalsByEmployeeSignal().map(r => r.totalHours));

  readonly pieChartType: ChartType = 'pie';
  readonly pieChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    plugins: {
      legend: {
        position: 'right'
      },
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<'pie'>) => {
            const label = ctx.label ?? '';
            const value = Number(ctx.raw ?? 0);
            const grand = this.grandTotalHoursSignal();
            const pct = grand > 0 ? ((value / grand) * 100).toFixed(1) : '0.0';
            return `${label}: ${value.toFixed(2)}h (${pct}%)`;
          }
        }
      }
    }
  };

  // Derived chart data object
  readonly pieChartDataComputed = computed<ChartData<'pie'>>(() => ({
    labels: this.pieChartLabelsSignal(),
    datasets: [{
      data: this.pieChartDataSignal(),
      backgroundColor: generateColorPalette(this.pieChartDataSignal().length),
    }]
  }));

  constructor() {
    this.fetchEntries();
  }

  fetchEntries(): void {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);
    this.http.get<TimeEntry[]>(this.apiUrl).subscribe({
      next: (entries) => {
        this.entriesSignal.set(entries ?? []);
        this.loadingSignal.set(false);
      },
      error: (err) => {
        this.loadingSignal.set(false);
        this.errorSignal.set('Failed to load entries');
        console.error(err);
      }
    });
  }
}

export interface TimeEntry {
  Id: string;
  EmployeeName: string;
  StarTimeUtc: string;
  EndTimeUtc: string;
  EntryNotes: string | null;
  DeletedOn: string | null;
}

export interface AggregatedTotal {
  name: string;
  totalHours: number;
}

function generateColorPalette(count: number): string[] {
  const colors: string[] = [];
  const hues = [
    0, 20, 40, 60, 80, 110, 140, 170, 200, 230, 260, 290, 320, 340
  ];
  for (let i = 0; i < count; i++) {
    const hue = hues[i % hues.length];
    const saturation = 65;
    const lightness = 55;
    colors.push(`hsl(${hue} ${saturation}% ${lightness}%)`);
  }
  return colors;
}
