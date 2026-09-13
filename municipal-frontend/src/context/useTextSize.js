import { useContext } from 'react'
import { TextSizeContext } from './text-size-context'

export const useTextSize = () => useContext(TextSizeContext)
