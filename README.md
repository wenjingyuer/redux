## Redux 设计思想

### Redux 解决了什么问题

在复杂前端应用中，想要优雅的实现各个子模块之间的通信管理是较为困难的，因为每个模块间进行独立通信时会存在时序难控制、状态难溯源等问题。比如多个模块都需要修改模块 A 中的数据，怎么控制他们的修改顺序、怎么记录修改的过程？ Redux 就是解决了上述的问题，通过提供一个全局唯一的状态仓库，以及单向数据流操作。使得状态可管理、可溯源、可控制时序。

### Redux 的设计思想

Redux 是基于 Facebook 提出的 Flux 设计模式进行实现，Flux 的核心理念是单向数据流：

```js
View->Actions->Dispacher->Store->View
```

View 层触发 Actions 事件，交给 Dispacher（本质上是注册到 Store 上的回调） 统一处理后，再根据 Action 的类型，执行对应修改 Store 数据的操作。Store 数据修改完成后，会派发一个广播事件给 View 层方法，这些方法可以获取 Store 的最新 State 并视情况更新 View。

这种设计的好处是其数据是单一方向流动的，数据的修改一定会经过 Actions、Dispacher 动作，这使得对数据的修改变得可预测、可溯源。

基于此，Redux 中数据更新的设计架构如下：

![20240914172423](https://raw.gitmirror.com/wenjingyuer/image_store/master/images/20240914172423.png)


### 源码结构解析

与上图中 Redux 的设计架构相对应，在源码中

- createStore 负责实现 Store 核心功能，创建 State、串联触发 action 到更新 state 的整体逻辑。
- applyMiddleware、compose 实现 middleware 相关逻辑
- combineReducers 实现组合多个 reducer

```shell
redux/src
.
├── applyMiddleware.ts // 实现 applyMiddleware 方法
├── bindActionCreators.ts  // 实现 bindActionCreators 方法
├── combineReducers.ts  // 实现 combineReducers 方法
├── compose.ts // compose 方法，内部供 applyMiddleware 使用，同 lodash 的 flowRight
├── createStore.ts// 实现 createStore 方法
├── index.ts
├── types
│   ├── actions.ts
│   ├── middleware.ts
│   ├── reducers.ts
│   └── store.ts
└── utils // 一些辅助函数，可不用关心
    ├── actionTypes.ts
    ├── formatProdErrorMessage.ts
    ├── isAction.ts
    ├── isPlainObject.ts
    ├── kindOf.ts
    ├── symbol-observable.ts
    └── warning.ts

```

### 核心模块详解

基于上文对 Flux 设计模式的描述可以得出，要实现 Flux 模式的第一步是创建 Store，因为 Dispatcher 和 View 都依赖于 Store 进行开展。对应在 Redux 中，第一步便是使用 CreateStore 方法创建 Store。

#### CreateStore

CreateStore 用法如下：

```JS
const store = createStore(reducer, preloadedState, enhancer);

const {getState,dispatch,subscribe,replaceReducer} = store
```

createStore 函数接受三个参数 reducer, preloadedState, enhancer，返回一个 store 对象，其包含 getState,dispatch,subscribe,replaceReducer 四个方法。

首先来看对入参的处理，reducer 对应上文 Flux 设计模式中的 dispacher 逻辑，传入 createStore 后会先做暂存处理，preloadedState 则是作为初始化的 Store State 数据，重点在 enhancer。enhancer
官方解释为可以用于实现第三方功能，如 middleware、时间旅行、持久化等功能来增强 store。听起来比较复杂，但其实现方式却是很简单：

```JS
function createStore(reducer, preloadedState, enhancer) {
   let currentReducer = reducer // 记录当前的 reducer
   let currentState = preloadedState // 记录当前的 state
   if (typeof enhancer !== 'undefined') {
    // 调用 enhancer
    return enhancer(createStore)(
      reducer,
      preloadedState as PreloadedState | undefined
    )
  }
  // 省略其他逻辑
}
```

可以发现 enhancer 的实现非常巧妙，它允许用户“劫持” createStore 原生返回的 store 对象，修改其中的 getState,dispatch 等方法后，再返回对应的新方法。

一个 logEnhancer 的案例如下，使用后会在每次 dispach 时 log 相关信息。从这个例子我们可以发现，enhancer 的编写是用到了面向切面编程（AOP）的设计：在不改动目标函数原有功能的前提下，注入实现新的功能。

```JS
const logEnhancer = (createStore)=>{
 return (reducer, preloadedState)=>{
  const {dispach,...rest} = createStore(reducer, preloadedState)
    return {
      dispach:(action)=>{
          console.log('当前 dispatch 的数据',actions)
          dispach(action);
      },
      ...rest
    }
 }
}

```

接下来分析 createStore 返回的 store 对象中几个方法的实现：getState,dispatch,subscribe,replaceReducer。

getState 的逻辑较为简单，即返回当前的 state 状态。

```JS
function createStore(reducer, preloadedState, enhancer) {
   let currentReducer = reducer // 记录当前的 reducer
   let currentState = preloadedState // 记录当前的 state
   let isDispatching = false // 是否正在进行 dispatch

   function getState() {
      return currentState // 通过 getState 获取当前的 state
   }

   // 触发 action
   function dispatch(action: A) {}

   function subscribe(listener: () => void) {}
   function replaceReducer(nextReducer: Reducer<S, A>) {}

   // 初次调用 createStore 时初始化 state
   dispatch({ type: ActionTypes.INIT } as A)

   // 返回一个 sttore
   const store = {
    dispatch: dispatch as Dispatch<A>,
    subscribe,
    getState,
    replaceReducer
   }
   return store
}
```

#### dispatch

dispach 是 Redux 中实现修改数据的**唯一途径**，调用时需要传入一个 action 对象，随后 Redux 会自动调用 reducer 获取更新后的 state，再调用所有注册的 lisener 实现数据更新广播。

从代码中我们可以发现，dispatch 仅支持普通对象，如果需要支持 dispatch Promise 等其他类型的 action，就需要使用额外 reducer 对原始 dispach 函数进行封装（如：redux-thunk 等），以支持其他类型的 action 对象。

```JS
  function dispatch(action: A) {
    // 省略其他逻辑

    // 在 Dispatching 过程中，不能再触发新的 dispatch
    if (isDispatching) {
      throw new Error('Reducers may not dispatch actions.')
    }

    try {
      // 加上执行🔒
      isDispatching = true
      // 调用 Reducer 获取新的 state
      currentState = currentReducer(currentState, action)
    } finally {
      isDispatching = false
    }

    const listeners = (currentListeners = nextListeners)
    // 触发所有订阅事件
    listeners.forEach(listener => {
      listener()
    })
    return action
  }
```

#### subscribe

在 Redux 中，需要通过 subscribe 注册回调函数，在 Store 内的 state 发生变化后， Redux 将会调用所有注册的回调函数。同时 subscribe 也会返回一个 unsubscribe 函数，执行后可以删除对应已注册的回调函数。

```JS
function subscribe(listener: () => void) {
    if (isDispatching) {
      throw new Error()
    }

    let isSubscribed = true

    ensureCanMutateNextListeners() // 给 nextListeners 开辟一个新的内存地址，确保对其的修改不影响当前正在执行的中的订阅函数队列
    const listenerId = listenerIdCounter++
    nextListeners.set(listenerId, listener) //nextListeners 添加订阅事件
    // 取消订阅事件
    return function unsubscribe() {
      if (!isSubscribed) { // 防止调用多次 unsubscribe
        return
      }

      if (isDispatching) {
        throw new Error()
      }

      isSubscribed = false

      ensureCanMutateNextListeners();
      nextListeners.delete(listenerId)
      currentListeners = null
    }
  }
```

ensureCanMutateNextListeners 的作用：

可以发现，在订阅以及取消订阅的过程中，都会先执行 ensureCanMutateNextListeners 函数，这个函数的作用是什么？

从代码中可以发现，该函数会在 nextListeners 和 currentListeners 指向同一处内存地址时，给 nextListeners 开辟一处新的内存地址，并将 currentListeners 中的回调函数地址同步到新的 nextListeners 中。

```JS
function ensureCanMutateNextListeners() {
    if (nextListeners === currentListeners) {
      nextListeners = new Map()
      currentListeners.forEach((listener, key) => {
        nextListeners.set(key, listener)
      })
    }
}
```

进一步分析，消费 nextListeners 和 currentListeners 的地方在哪里，答案在 dispach 方法中：

```JS
  function dispatch(action: A) {
    // 省略其他逻辑
    // 这里会同步 nextListeners 的内存地址到 currentListeners，最终赋值给 listeners 后进行依次调用
    const listeners = (currentListeners = nextListeners)
    // 触发所有订阅事件
    listeners.forEach(listener => {
      listener()
    })
    return action
  }
```

到这里即可明确 ensureCanMutateNextListeners 函数的作用：切割 listeners、currentListeners 和 nextListeners 的内存地址，保证在单次 dispatch 过程中 listeners 对应回调函数的数量不会发生变化，保证执行稳定性。

执行 subscribe/unsubscribe 之前：

`listeners=currentListeners=nextListeners`

开始执行 subscribe/unsubscribe ：

`listeners=currentListeners≠nextListeners`

随后再执行修改 nextListeners 中的回调函数数量就不会影响正在进行的 dispach 过程。

如果没有 ensureCanMutateNextListeners 函数，在以下类型场景时就会出现异常（未定义错误/某些回调函数没有没执行）：

```javascript
let store = createStore(reducer);

let unsubscribe2 = ()=>{}

let unsubscribe1 = store.subscribe(() => {
  console.log('Listener 1')；
  unsubscribe2()
  unsubscribe1(); // 在 dispatch 过程中移除函数自己
});

unsubscribe2 = store.subscribe(() => {
  console.log('Listener 2');
});

store.dispatch({ type: 'ACTION_TYPE' });
```

#### replaceReducer

replaceReducer 的实现较为简单，传入新的 Reducer 替换原有 Reducer 后，再执行一遍 state 初始化逻辑，使得 state 更新为对应新 Reducer 的结果。

在开发某些大型应用的过程中，可能会根据不同的路由或模块动态加载 reducer。这样可以减少初始加载时间，提高应用性能。当新的模块加载时，可以使用 replaceReducer 替换当前的 reducer。Redux Dev Tools 也有使用这个功能进行状态回放。

```typescript
function replaceReducer(nextReducer: Reducer<S, A>): void {
  currentReducer = nextReducer as unknown as Reducer<S, A, PreloadedState>
  dispatch({ type: ActionTypes.REPLACE } as A)
}
```

### combineReducers

在应用逻辑比较复杂时，对应需要管理的 Reducer 和 state 状态也会增加，使用 combineReducers 可以将 Reducer 根据业务逻辑拆解为多个部分，每个部分独立维护整体 State 的一部分，以此降低应用的开发复杂度。

仅保留核心代码逻辑的 combineReducers 函数如下。

```JS
export default function combineReducers(reducers: {
  [key: string]: Reducer<any, any, any>
}) {
  const reducerKeys = Object.keys(reducers)
  const finalReducers: { [key: string]: Reducer<any, any, any> } = {}
  for (let i = 0; i < reducerKeys.length; i++) {
    const key = reducerKeys[i]
  }
  const finalReducerKeys = Object.keys(finalReducers)
  return function combination(
    state: StateFromReducersMapObject<typeof reducers> = {},
    action: Action
  ) {
    let hasChanged = false
    const nextState: StateFromReducersMapObject<typeof reducers> = {}
    for (let i = 0; i < finalReducerKeys.length; i++) {
      const key = finalReducerKeys[i]
      const reducer = finalReducers[key]
      const previousStateForKey = state[key]
      const nextStateForKey = reducer(previousStateForKey, action)
      nextState[key] = nextStateForKey
      hasChanged = hasChanged || nextStateForKey !== previousStateForKey
    }
    hasChanged =
      hasChanged || finalReducerKeys.length !== Object.keys(state).length
    return hasChanged ? nextState : state
  }
}

```

可以发现，combineReducers 其实是返回了一个新的 Reducers 函数（combination），当 dispach 触发时候，该函数会遍历执行每个模块的 Reducer，并更新对应模块的 State。每个 Reducer 返回的 state 对象也按照传入 combineReducers 中的 Key 进行命名：

```js
rootReducer = combineReducers({potato: potatoReducer, tomato: tomatoReducer})
// 这将返回如下的 state 对象
{
  potato: {
    //
  tomato: {
  }
}
```

### applyMiddleware

上文介绍 dispach 函数功能时有提到，dispatch 仅支持普通对象，而在实际开发中往往需要对 dispatch 做拓展，以支持 dispatch Promise 等其他类型的 action 对象，或是添加一些日志上报、数据缓存等操作。

applyMiddleware 就是为了解决在使用 Redux 过程中需要高频创建、组合多种对 dispach 的拓展的需求 ——> 在 dispach action 到执行 reducer 的过程中，先执行一系列的 middleware，类似 Express、koa 等框架的中间件概念。

```js
View->Actions->[middleware1]->[middleware2]->Dispacher->Store->View
```

applyMiddleware 的源码如下：

```JS
export default function applyMiddleware(
  ...middlewares: Middleware[]
): StoreEnhancer<any> {
  return createStore => (reducer, preloadedState) => {
    const store = createStore(reducer, preloadedState)
    let dispatch: Dispatch = () => {
      throw new Error(
        'Dispatching while constructing your middleware is not allowed. ' +
          'Other middleware would not be applied to this dispatch.'
      )
    }

    const middlewareAPI: MiddlewareAPI = {
      getState: store.getState,
      dispatch: (action, ...args) => dispatch(action, ...args)
    }
    const chain = middlewares.map(middleware => middleware(middlewareAPI))
    // store.dispatch 是作为最后一个执行函数的 next ：最右边那个

    //中间件执行顺序从左到右，洋葱模型。 所以在最左边的函数执行完 next 后，所有 state 即更新完毕
    dispatch = compose<typeof dispatch>(...chain)(store.dispatch)
    return {
      ...store,
      dispatch
    }
  }
}
```

分析 applyMiddleware 的实现我们可以发现：applyMiddleware 本质上是返回了一个 enhancer 函数，该函数对 createStore 返回的 dispatch 函数做了“增强”。

一个典型的 middleware 如下，该 middleware 是一个三层嵌套函数，在 dispaching 过程中执行 log 数据的操作。结合上述 applyMiddleware 的实现我们可以发现，middleware 外层的 2 个函数都是在执行 applyMiddleware 的过程中就被调用了，最内层函数才会在 dispach action 后执行，因此实际的操作代码需要写在最内层函数中。

```JS
function exampleMiddleware(storeAPI) {
  return function wrapDispatch(next) {
    return function handleAction(action) {
   // 实际操作代码需要写在最内层函数这里
      console.log('dispatching', action)
      let result = next(action)
      console.log('next state', storeAPI.getState())
      return result
    }
  }
}
const middlewareEnhancer = applyMiddleware(exampleMiddleware)
// 将 enhancer 为第二参数，因为没有 preloadedState
const store = createStore(rootReducer, middlewareEnhancer)
```

compose 函数是实现 applyMiddleware 的关键，这个方法和 lodash 中的 flowRight 方法类似。

```JS
function compose(...funcs) {
  if (funcs.length === 0) {
    // infer the argument type so it is usable in inference down the line
    return (arg:) => arg
  }
  if (funcs.length === 1) {
    return funcs[0]
  }
  return funcs.reduce(
    (a, b) =>
      (...args) =>
        a(b(...args))
  )
}
```

在 compose 函数中，通过 reduce 方法实现了从右到左组合多个函数功能：compose(f, g, h) -> (...args) => f(g(h(...args)))。

而 middleware 按传入顺序从左到右执行的原因在于，传入 compose 的 chain 是一系列二层函数，所以调用新 dispatch 函数后最先执行的是 chain 中的第一项（因为第一项在 compose 函数中会最后执行返回），而第一项的函数中又通过 next() 调用了第二项。... 进而实现了 middleware 的从左到右的依次调用。

```JS
export default function applyMiddleware(
  ...middlewares: Middleware[]
): StoreEnhancer<any> {
  return createStore => (reducer, preloadedState) => {
    // 省略其他逻辑
    // chain：[fun1(next){ return fun11(action){next()} },fun2(next){ return fun22(action){next()} },fun3(next){ return fun33(action){next()} }]
    const chain = middlewares.map(middleware => middleware(middlewareAPI))
    // dispatch : (action) => fun11(action){
    //   fun22(action){
    //     fun33(action){
    //     }
    //   }
    // }
    dispatch = compose<typeof dispatch>(...chain)(store.dispatch)
    return {
      ...store,
      dispatch
    }
  }
}
```

我们可以从日志上直观感受下执行顺序：

```JS
import { createStore, applyMiddleware } from "redux";
const initialState = {
  count: 0
}
function reducer(state = initialState, action: { type: string}) {
  switch (action.type) {
      case 'add':
          return {
              ...state,
              count: state.count + 1
          }
      case 'reduce':
          return {
              ...state,
              count: state.count - 1
          }
      default:
          return initialState;
  }
}
const logger1 = storeAPI => next => {
  console.log('logger1 执行返回最内层函数')
  return action => {
  console.log('logger1 开始');
  const result = next(action)
  console.log('logger1 结束');
  return result
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
// @ts-ignore
const logger3 = storeAPI => next => {
  console.log('logger3 执行返回最内层函数')
  return action => {
  console.log('logger3 开始');
  const result = next(action)
  console.log('logger3 结束');
  return result
}
const middlewares = applyMiddleware(logger1, logger2, logger3);
const store = createStore(reducer, middlewares);
store.dispatch({ type: 'add' });
```

上方代码的输出依次为：

```JS
// 初始化后立即输出
logger3 执行返回最内层函数
logger2 执行返回最内层函数
logger1 执行返回最内层函数
// 触发 dispach 后输出
logger1 开始
logger2 开始
logger3 开始
logger3 结束
logger2 结束
logger1 结束
```

从 dispach 触发后的日志上也可以看出这是一个经典的洋葱模型设计， Koa、Express 框架的中间件功能也使用了这个设计模式。

![20240902141732](https://raw.gitmirror.com/wenjingyuer/image_store/master/images/20240902141732.png)

### bindActionCreators

这个 API 在实际开发中使用较少，Redux 文档描述为“唯一使用场景是当你需要把 action creator 往下传到一个组件上，却不想让这个组件觉察到 Redux 的存在，而且不希望把 dispatch 或 Redux store 传给它。” 所以这个函数的作用我们可以简单理解为：**减少冗余代码+重复逻辑**。

结合实际案例理解，下面是一段使用 react-redux 中 mapDispatchToProps 方法的代码：

```JS
mapDispatchToProps((dispatch)=>{
　　return {
      action1:(data) => dispatch( { type:'add',payload:data } )
　　　    　/* 通常情况下都用 actioncreator 来生成 action，所以通常是下面的写法：
          action:(data) => dispatch( actioncreator(data) )
　　        */
  }
})
```

由于通常的写法下 action 都是由 actioncreator 来生成的，既然所有 action 函数的都有这样的操作，那我们可以设计函数来封装一下，于是就有了 bindActionCreators，写法变成了这样：

```JS
mapDispatchToProps =((dispatch)=>{
      return {
 　　     ...bindActionCreators({
              action1:actionCreator1,
　　　　　   　 action2:actionCreator2  //这样写的花就不涉及 dispatch 等操作的明文编写了
          },dispatch)
       }
}
```

bindActionCreators 的核心实现逻辑是给每个 actionCreator 返回一个与 dispach 绑定的执行函数，该函数执行后，会自动 dispach 对应的 action。

```JS
export default function bindActionCreators(
  actionCreators: ActionCreator<any> | ActionCreatorsMapObject,
  dispatch: Dispatch
) {
  // 支持单个 actionCreators
  if (typeof actionCreators === 'function') {
    return bindActionCreator(actionCreators, dispatch)
  }
  // 省略校验逻辑

  const boundActionCreators: ActionCreatorsMapObject = {}
  for (const key in actionCreators) {
    const actionCreator = actionCreators[key]
    if (typeof actionCreator === 'function') {
      boundActionCreators[key] = bindActionCreator(actionCreator, dispatch)
    }
  }
  return boundActionCreators
}

function bindActionCreator<A extends Action>(
  actionCreator: ActionCreator<A>,
  dispatch: Dispatch<A>
) {
  return function (this: any, ...args: any[]) {
    return dispatch(actionCreator.apply(this, args))
  }
}

```


