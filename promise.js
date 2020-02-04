const PENDING = Symbol('PENDING')
const RESOLVED = Symbol('RESOLVED')
const REJECTED = Symbol('REJECTED')

// Promise 构造函数
function Promise(executor) {
  // 当前的状态，默认是 pending
  this.status = PENDING
  // 保存回调函数，因为 then 可以调用多次，所以以数组保存
  this.onResolvedCallbacks = []
  this.onRejectedCallbacks = []
  // 成功值
  this.value = undefined
  // 拒绝的原因
  this.reason = undefined

  // resolve、reject 是用来改变状态，
  // 并且根据 then 方法注册回调函数的顺序依次调用回调函数
  // resolve 是执行成功后调用的函数
  const resolve = (value) => {
    // 如果状态不是 pending，说明状态已经改变，不能再发生变化
    if (this.status === PENDING) {
      this.value = value
      this.status = RESOLVED
      this.onResolvedCallbacks.forEach(fn => fn())
    }
  }
  // reject 是执行失败后调用的函数
  const reject = (reason) => {
    if (this.status === PENDING) {
      this.reason = reason
      this.status = REJECTED
      this.onRejectedCallbacks.forEach(fn => fn())
    }
  }
  // 使用 try...catch... 捕捉代码执行过程中可能抛出的异常
  try {
    // 执行器默认会立即执行
    executor(resolve, reject)
  } catch (e) {
    // 如果执行时发生错误（包括手动抛出的异常），等同于执行失败
    reject(e)
  }
}

/**
 * 实现 Promise 的 then 方法
 * then 方法有两个可选参数，onFulfilled 和 onRejected，并且必须返回一个 promise 对象
 * 有部分同学可能会认为 then 是在 promise 状态改变后（即有返回值后）才执行
 * 其实 then 是立即执行，是 onFulfilled 和 onRejected 才在状态改变后执行。
 * 
 * 如果 onFulfilled 或 onRejected 返回的是一个 promise，会自动执行这个 promise，并采用它的状态。如果成功则将成功的结果向外层的下一个 then 传递。
 */
Promise.prototype.then = function (onFulfilled, onRejected) {
  // onFulfilled 和 onRejected 是可选的，这里需要对不传的时候做兼容处理
  // onFulfilled 如果不是函数，就构建一个函数，函数直接返回结果。
  onFulfilled = typeof onFulfilled === 'function' ? onFulfilled : value => value;
  // onRejected 如果不是函数，就构建一个函数，函数直接抛出异常。
  onRejected = typeof onRejected === 'function' ? onRejected : reason => {
    throw reason;
  }

  let promise2 = new Promise((resolve, reject) => {
    // 状态为 resolved 或 rejected 时，主要是 new Promise 时执行器里面调用 resolve/reject 是同步的
    if (this.status === RESOLVED) {
      // 使用 setTimeout (宏任务)，确保 onFulfilled 和 onRejected 方法异步执行，也确保 promise2 已经定义，
      // 如果不使用 setTimeout，会导致执行 resolvePromise(promise2, x, resolve, reject) 时 promise2 未定义而报错。
      setTimeout(() => {
        // try...catch... 捕捉代码错误或手动抛出的异常，报错或异常当作执行失败处理。异步代码的报错无法被外层的 try...catch... 捕获
        try {
          const x = onFulfilled(this.value)
          // x 可能是 promise 也可能是普通值，x 本次 then 调用中 onFulfilled 或 onRejected 回调函数返回的结果，需要传递给下一个 then 的回调函数
          // 使用公共方法 resolvePromise 处理不同情况，并实现 x 值的传递。
          resolvePromise(promise2, x, resolve, reject)
        } catch (e) {
          reject(e)
        }
      }, 0)

      return
    }
    if (this.status === REJECTED) {
      setTimeout(() => {
        try {
          const x = onRejected(this.reason)
          resolvePromise(promise2, x, resolve, reject)
        } catch (e) {
          reject(e)
        }
      }, 0)
    }
    // 状态为 pending 时，主要是 new Promise 时执行器里面调用 resolve/reject 是异步的
    if (this.status === PENDING) {
      // 因为是异步的，不知道何时执行完成，所以这里先存好回调函数的调用（订阅），等状态改变后再执行（发布）
      this.onResolvedCallbacks.push(() => {
        setTimeout(() => {
          try {
            const x = onFulfilled(this.value)
            resolvePromise(promise2, x, resolve, reject)
          } catch (e) {
            reject(e)
          }

        }, 0)
      })
      this.onRejectedCallbacks.push(() => {
        setTimeout(() => {
          try {
            const x = onRejected(this.reason)
            resolvePromise(promise2, x, resolve, reject)
          } catch (e) {
            reject(e)
          }
        })
      })
    }
  })
  return promise2
}

/**
 * resolvePromise 根据规范（promise resolution procedure）实现
 * 
 * @param {*} promise2 是 then 方法返回的 promise 对象
 * @param {*} x 是 onFulfilled 或 onRejected 返回的结果
 * @param {*} resolve 
 * @param {*} reject 
 */
const resolvePromise = (promise2, x, resolve, reject) => {
  // 如果 promise2 和 x 指向同一对象, promise2 执行失败并且使用 TypeError 作为执行失败的原因
  if (promise2 === x) {
    return reject(new TypeError('Chaining cycle detected for promise #<promise>'))
  }
  if ((typeof x === 'object' && x !== null) || typeof x === 'function') {
    // 防止多次调用成功或者失败
    let called;
    try {
      // 首先存储一个指向 x.then 的引用，然后测试并调用该引用，以避免多次访问 x.then 属性
      // 预防取 x.then 的时候错误，例如: .then 是通过 Object.defineProperty 定义的，定义的 get() {}（getter） 可能代码错误或抛出异常
      let then = x.then
      // 没用 x.then 判断因为怕再次取 .then 的时候出错。例如：通过 Object.defineProperty 定义的 then 可能第一次调用不报错，第二次调用报错或多次调用返回的值可能不同
      if (typeof then === 'function') {
        // 如果 then 是一个函数，则认为 x 是一个 promise，以 x 为 它的 this 调用它, then 调用完成就会取到 x 的状态，采用 x 的状态返回
        // 并且传递两个回调函数作为参数，第一个参数是 resolvePromise，第二个参数是 rejectPromise
        then.call(x, y => {
          if (called) {
            return
          }
          called = true
          // y 是 x 调用 then 后成功的结果，采用这个结果
          // y 可能还是一个 promise，所以进行递归调用，直到结果是一个普通值
          resolvePromise(promise2, y, resolve, reject)
        }, r => {
          // r 是调用 x.then 后报错或异常，不再判断是否是 promise，直接传递
          if (called) {
            return
          }
          called = true
          reject(r); // 失败结果向下传递
        });
      } else {
        // 普通对象，直接传递给下一个 then
        resolve(x)
      }
    } catch (e) {
      // 发生代码错误或手动抛出异常，则当执行失败处理并以 e 为失败原因
      if (called) {
        return
      }
      called = true
      reject(e)
    }

  } else {
    // 普通值，直接传递给下一个 then
    resolve(x)
  }
}

Promise.defer = Promise.deferred = function () {
  let dfd = {}
  dfd.promise = new Promise((resolve, reject) => {
    dfd.resolve = resolve
    dfd.reject = reject
  })
  return dfd
}

Promise.prototype.finally = function (callback) {
  return this.then((value) => {
    return Promise.resolve(callback()).then(() => {
      return value
    })
  }, (err) => {
    return Promise.resolve(callback()).then(() => {
      throw err
    })
  });
}

Promise.prototype.catch = function (onRejected) {
  return this.then(null, onRejected)
}

Promise.resolve = function (param) {
  if (param instanceof Promise) {
    return param;
  }
  return new Promise((resolve, reject) => {
    if (param && param.then && typeof param.then === 'function') {
      setTimeout(() => {
        param.then(resolve, reject)
      })
    } else {
      resolve(param)
    }
  })
}

Promise.reject = function (reason) {
  return new Promise((resolve, reject) => {
    reject(reason)
  })
}

const isPromise = val => (((typeof val === 'object' && val !== null) || typeof val === 'function') && typeof val.then === 'function')

Promise.all = function (promises) {
  return new Promise((resolve, reject) => {
    // 存放结果，.all 传入的参数是数组，返回结果也是数据
    let result = []
    // 使用计数器，记录多个异步并发问题
    let index = 0
    if (promises.length === 0) {
      resolve(result)
    } else {
      // 处理返回值
      function processValue(i, data) {
        result[i] = data
        // 计数器记录的个数等于传入的数组长度，说明全部认为已完成，可以返回结果
        if (++index === promises.length) {
          resolve(result)
        }
      }
      for (let i = 0; i < promises.length; i++) {
        let current = promises[i]
        // 判断当前的处理对象是 promise 还是普通值
        if (isPromise(current)) {
          // 取当前的处理对象的执行结果，如果有一个执行失败，则直接 reject
          current.then(data => {
            processValue(i, data)
          }, reject)
        } else {
          processValue(i, current)
        }
      }
    }
  })
}

Promise.race = function (promises) {
  return new Promise((resolve, reject) => {
    if (promises.length === 0) {
      return
    } else {
      for (let i = 0; i < promises.length; i++) {
        Promise.resolve(promises[i]).then((data) => {
          resolve(data)
          return
        }, (err) => {
          reject(err)
          return
        })
      }
    }
  });
}

module.exports = Promise