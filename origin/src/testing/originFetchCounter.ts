let fetchCount = 0

export function recordOriginFetch() {
  fetchCount += 1
}

export function getOriginFetchCount() {
  return fetchCount
}

export function resetOriginFetchCount() {
  fetchCount = 0
}
