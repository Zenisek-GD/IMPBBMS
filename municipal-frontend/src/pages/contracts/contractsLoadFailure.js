// Keep the contracts screen honest about why its data is unavailable. Axios
// errors are intentionally inspected here rather than rendered directly: a
// response body can be appropriate for an API client but may contain technical
// detail that does not belong in an officer-facing message.
export function describeContractsLoadFailure(error) {
  const status = error?.response?.status

  if (status === 401) {
    return {
      title: 'Your session has ended',
      message: 'Sign in again to view contracts.',
      retryable: false,
    }
  }

  if (status === 403) {
    return {
      title: 'You cannot view contracts',
      message: 'Your current role does not have permission to view contract records.',
      retryable: false,
    }
  }

  if (status === 404) {
    return {
      title: 'Contracts are unavailable',
      message: 'The contracts service could not be found. Contact your system administrator if this continues.',
      retryable: false,
    }
  }

  if (status === 429) {
    return {
      title: 'Please wait before trying again',
      message: 'Too many requests were sent to the contracts service. Wait a moment, then retry.',
      retryable: true,
    }
  }

  if (Number.isInteger(status) && status >= 500) {
    return {
      title: 'The contracts service is temporarily unavailable',
      message: 'The system could not load contracts right now. Please retry in a moment.',
      retryable: true,
    }
  }

  if (Number.isInteger(status)) {
    return {
      title: 'Contracts could not be loaded',
      message: 'The contracts request could not be completed. Refresh the page and try again.',
      retryable: false,
    }
  }

  if (error?.code === 'ECONNABORTED') {
    return {
      title: 'The contracts request timed out',
      message: 'The system took too long to respond. Check your connection and retry.',
      retryable: true,
    }
  }

  return {
    title: 'Contracts could not be reached',
    message: 'Check your connection, then retry loading contracts.',
    retryable: true,
  }
}
