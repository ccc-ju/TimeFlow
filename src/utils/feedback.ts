export function haptic(type: 'light' | 'medium' = 'light') {
  try {
    uni.vibrateShort({
      type
    })
  } catch (error) {
    console.debug('haptic skipped', error)
  }
}

export function notifyDone() {
  haptic('medium')
}
