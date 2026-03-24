<script setup lang="ts">
import { computed } from 'vue'

import EchartBox from '@/components/charts/echart-box.vue'
import { useAppStore } from '@/store/app'
import { useTaskStore } from '@/store/tasks'

const appStore = useAppStore()
const taskStore = useTaskStore()

const trendOption = computed(() => ({
  animation: false,
  grid: {
    left: 10,
    right: 10,
    top: 16,
    bottom: 10,
    containLabel: true
  },
  xAxis: {
    type: 'category',
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: {
      color: '#90A3B2',
      fontSize: 11
    },
    data: taskStore.focusTrend.map((item) => item.dayKey.slice(5))
  },
  yAxis: {
    type: 'value',
    splitLine: {
      lineStyle: {
        color: 'rgba(144, 163, 178, 0.12)'
      }
    },
    axisLabel: {
      color: '#90A3B2',
      formatter: '{value}m'
    }
  },
  series: [
    {
      type: 'bar',
      barWidth: 18,
      itemStyle: {
        borderRadius: [999, 999, 0, 0],
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: '#A8E6CF' },
            { offset: 1, color: '#7AB3EF' }
          ]
        }
      },
      data: taskStore.focusTrend.map((item) => Math.round(item.seconds / 60))
    }
  ]
}))

const donutOption = computed(() => ({
  animation: false,
  series: [
    {
      type: 'pie',
      radius: ['58%', '82%'],
      label: { show: false },
      data: [
        {
          value: taskStore.todayStats.completedCount,
          itemStyle: { color: '#7AB3EF' }
        },
        {
          value: Math.max(0, taskStore.todayStats.totalPlanned - taskStore.todayStats.completedCount),
          itemStyle: { color: 'rgba(148, 164, 184, 0.16)' }
        }
      ]
    }
  ]
}))
</script>

<template>
  <view class="overview">
    <view class="overview__wide glass-card">
      <view class="overview__copy">
        <text class="overview__eyebrow">{{ appStore.t('focusTrend') }}</text>
        <text class="overview__big">{{ taskStore.todayStats.totalFocusMinutes }}</text>
        <text class="overview__label">{{ appStore.t('minutesUnit') }}</text>
      </view>
      <view class="overview__chart">
        <EchartBox :option="donutOption" height="180rpx" />
      </view>
    </view>

    <view class="overview__mini glass-card">
      <text class="overview__mini-value">{{ taskStore.todayStats.totalPlanned }}</text>
      <text class="overview__mini-label">{{ appStore.t('totalPlan') }}</text>
    </view>

    <view class="overview__mini glass-card">
      <text class="overview__mini-value">{{ taskStore.todayStats.completedCount }}</text>
      <text class="overview__mini-label">{{ appStore.t('completed') }}</text>
    </view>
  </view>

  <view class="chart-card glass-card">
    <text class="chart-card__title">{{ appStore.t('focusTrend') }}</text>
    <EchartBox :option="trendOption" height="380rpx" />
  </view>
</template>

<style scoped lang="scss">
.overview {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18rpx;
  margin-bottom: 24rpx;
}

.overview__wide {
  grid-column: span 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 28rpx;
}

.overview__copy {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.overview__eyebrow,
.overview__mini-label {
  color: var(--tf-text-secondary);
  font-size: 24rpx;
}

.overview__big {
  color: var(--tf-text-primary);
  font-size: 90rpx;
  font-weight: 700;
  line-height: 1;
}

.overview__label {
  color: var(--tf-text-secondary);
  font-size: 26rpx;
}

.overview__chart {
  width: 220rpx;
  height: 180rpx;
}

.overview__mini {
  padding: 24rpx;
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.overview__mini-value {
  color: var(--tf-text-primary);
  font-size: 56rpx;
  font-weight: 700;
}

.chart-card {
  padding: 26rpx;
}

.chart-card__title {
  display: block;
  margin-bottom: 16rpx;
  color: var(--tf-text-primary);
  font-size: 32rpx;
  font-weight: 700;
}
</style>
