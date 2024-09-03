// @ts-nocheck
import { configureStore, ThunkAction, Action, applyMiddleware } from '@reduxjs/toolkit'
import counterReducer from '../features/counter/counterSlice'
// @ts-ignore
const logger1 = storeAPI => next => {
  console.log('logger1 执行返回最内层函数')
  return action => {
  console.log('logger1 开始');
  const result = next(action)
  console.log('logger1 结束');
  return result
}
}
// @ts-ignore
const logger2 = storeAPI => next => {
  console.log('logger2 执行返回最内层函数')
  return action => {
  console.log('logger2 开始');
  const result = next(action)
  console.log('logger2 结束');
  return result
}
}
// @ts-ignore
const logger3 = storeAPI => next => {
  console.log('logger3 执行返回最内层函数')
  return action => {
  console.log('logger3 开始');
  const result = next(action)
  console.log('logger3 结束');
  return result
}
}


export const store = configureStore({
  reducer: {
    counter: counterReducer
  },
  middleware:(getDefaultMiddleware)=>getDefaultMiddleware().concat(logger1, logger2, logger3)
})

export type AppDispatch = typeof store.dispatch
export type RootState = ReturnType<typeof store.getState>
export type AppThunk<ReturnType = void> = ThunkAction<
  ReturnType,
  RootState,
  unknown,
  Action<string>
>
