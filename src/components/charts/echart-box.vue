<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    option: Record<string, any>
    height?: string
  }>(),
  {
    height: '320rpx'
  }
)

const chartId = `tf-chart-${Math.random().toString(36).slice(2, 10)}`

const payload = computed(() =>
  JSON.stringify({
    id: chartId,
    option: props.option
  })
)
</script>

<template>
  <view class="echart-box" :style="{ height }">
    <view :id="chartId" class="echart-box__inner" :prop="payload" :change:prop="chartRender.renderChart" />
  </view>
</template>

<script module="chartRender" lang="renderjs">
import * as echarts from 'echarts'

const instances = {}

export default {
  methods: {
    renderChart(payload) {
      if (!payload || typeof document === 'undefined') return

      const data = typeof payload === 'string' ? JSON.parse(payload) : payload
      const element = document.getElementById(data.id)

      if (!element) {
        setTimeout(() => this.renderChart(payload), 60)
        return
      }

      let chart = instances[data.id]
      if (!chart) {
        chart = echarts.init(element, null, { renderer: 'svg' })
        instances[data.id] = chart
      }

      chart.setOption(data.option || {}, true)
      chart.resize()
    }
  }
}
</script>

<style scoped lang="scss">
.echart-box {
  width: 100%;
}

.echart-box__inner {
  width: 100%;
  height: 100%;
}
</style>
