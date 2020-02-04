# Promise 原理解析与源码实现（遵循 Promise/A+ 规范）

### 1. 构造函数

`new Promise` 时，需要传递一个 executor 执行器，执行器立刻执行（同步执行），executor 接受两个参数，分别是 resolve（成功） 和 reject（失败）。

promise 有 3 个状态：pending（等待态）、fulfilled（成功态）、rejected（失败态）

```javascript
const PENDING = Symbol('PENDING')
const RESOLVED = Symbol('RESOLVED')
const REJECTED = Symbol('REJECTED')

// Promise 构造函数
function Promise (executor) {
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
  } catch(e) {
    // 如果执行时发生错误（包括手动抛出的异常），等同于执行失败
    reject(e)
  }
}
```

### 2. then 方法实现

实现 Promise 的 `then` 方法，`then` 方法有两个可选参数，`onFulfilled` 和 `onRejected`，并且必须返回一个 promise 对象。
如果 `onFulfilled` 或 `onRejected` 返回的是一个 promise，会自动执行这个 promise，并采用它的状态。如果成功则将成功的结果向外层的下一个 then 传递。

```javascript
Promise.prototype.then = function(onFulfilled, onRejected) {
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
```

有部分同学可能会认为 `then` 是在 promise 状态改变后（即有返回值后）才执行，其实 `then` 是立即执行，是 `onFulfilled` 和 `onRejected` 才在状态改变后执行。

### 3. Promise Resolution Procedure 的实现

**Promise 解决程序（promise resolution procedure）** 是一个抽象的操作，需要输入一个 promise 和一个值，我们表示为`[[Resolve]](promise, x)`。

这里我们定义公用方法 `resolvePromise` 来实现这个过程。

`resolvePromise` 主要实现的功能是：

1. 判断 `promise` 和 `x` 是否指向同一对象，如果是 `promise2` 执行失败并且使用 TypeError 作为执行失败的原因。

   例如：

   ```javascript
   const p = new Promise((resolve, reject) => resolve(1))
   let promise2 = p.then(() => {
     // x
     return promise2
   })
   ```

   

2. 判断 `x` 是不是一个 promise 对象，如果是就通过调用 resolve／reject 获取状态并向下个 `then` 传递 。

3. 如果 `x` 是一个普通对象／值，则直接将 `x` 作为结果值向下个 `then` 传递。

下面是代码实现：

```javascript
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
```

### 4. deferred 的实现

```javascript
Promise.defer = Promise.deferred = function () {
  let dfd = {}
  dfd.promise = new Promise((resolve, reject) => {
    dfd.resolve = resolve
    dfd.reject = reject
  })
  return dfd
}
```

`deferred` 的作用：

 1. 使用 `promise-aplus-test` 工具需要用到这个方法

 2. 这个方法可以减少代码嵌套

    例如：

    ```javascript
    const Promise = require('./pormise')
    const fs = require('fs')
    const readfile = url => {
      return new Promise((resolve, reject) => { // 一层嵌套
        fs.readFile(url, 'utf-8', (err, data) => { // 二层嵌套
          if(err) reject(err)
          resolve(data)
        })
      })
    }
    readfile('./package.json').then(data => console.log(data))
    ```

    使用 `deferred` ：

    ```javascript
    const readfile = url => {
      let dfd = Promise.defer()
      // 减少了一层嵌套
      fs.readFile(url, 'utf-8', (err, data) => {
        if(err) dfd.reject(err)
        dfd.resolve(data)
      })
      return dfd.promise
    }
    ```

### 5. 测试

测试使用工具 [promises-aplus-test](https://github.com/promises-aplus/promises-tests)

安装：

`npm install -g promises-aplus-test`

测试: 

`promise-aplus-test promise.js`

使用本文提供的 [github源码](https://github.com/silinchen/promise) 则可以直接运行以下命令：

```shell
// 安装依赖工具
npm install
// 运行测试指令
npm run test
```

### 6. Promise的其他方法

上面已经实现了 Promise 的核心部分代码，但原生的 Promise 还提供一些其他的方法。

1. Promise.resolve()
2. Promise.reject()
3. Promise.all()
4. Promise.race()
5. Promise.prototype.catch()
6. Promise.prototype.finally()

#### 1）Promise.resolve()

有时需要将现有对象转为 Promise 对象，`Promise.resolve()`方法就起到这个作用。

`Promise.resolve()`等价于下面的写法。

```javascript
Promise.resolve('foo')
// 等价于
new Promise(resolve => resolve('foo'))
```

`Promise.resolve`方法的参数分成四种情况。

- 参数是一个promise，`Promise.resolve` 不做任何修改，原封不动返回
- 参数是一个 `thenable` 对象，`Promise.resolve`方法会将这个对象转为 Promise 对象，然后就立即执行`thenable`对象的`then`方法。
- 参数不是具有 `then` 方法的对象，或根本就不是对象，`Promise.resolve `方法返回一个新的 Promise 对象，状态为`resolved`
- 不带有任何参数，直接返回一个`resolved`状态的 Promise 对象。

```javascript
Promise.resolve = function (param) {
        if (param instanceof Promise) {
        return param;
    }
    return new Promise((resolve, reject) => {
        if (param && param.then && typeof param.then === 'function') {
            setTimeout(() => {
                param.then(resolve, reject);
            });
        } else {
            resolve(param);
        }
    });
}
```

#### 2）Promise.reject()

`Promise.reject(reason)`方法也会返回一个新的 Promise 实例，该实例的状态为`rejected`。

`Promise.reject()`方法的参数，会原封不动地作为`reject`的理由，变成后续方法的参数。这一点与`Promise.resolve`方法不一致。

```javascript
Promise.reject = function (reason) {
    return new Promise((resolve, reject) => {
        reject(reason);
    });
}
```

#### 3）Promise.all()

`Promise.all() `方法用于将多个 Promise 实例，包装成一个新的 Promise 实例。

```javascript
const p = Promise.all([p1, p2, p3]);
```

上面代码中，`Promise.all()`方法接受一个数组作为参数，`p1`、`p2`、`p3`都是 Promise 实例，如果不是，就会先调用下面讲到的`Promise.resolve`方法，将参数转为 Promise 实例，再进一步处理。另外，`Promise.all()`方法的参数可以不是数组，但必须具有 Iterator 接口，且返回的每个成员都是 Promise 实例。

`p`的状态由`p1`、`p2`、`p3`决定，分成两种情况。

（1）只有`p1`、`p2`、`p3`的状态都变成`fulfilled`，`p`的状态才会变成`fulfilled`，此时`p1`、`p2`、`p3`的返回值组成一个数组，传递给`p`的回调函数。

（2）只要`p1`、`p2`、`p3`之中有一个被`rejected`，`p`的状态就变成`rejected`，此时第一个被`reject`的实例的返回值，会传递给`p`的回调函数。

```javascript
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
```

#### 4）Promise.race()

`Promise.race()`方法同样是将多个 Promise 实例，包装成一个新的 Promise 实例。

```javascript
const p = Promise.race([p1, p2, p3]);
```

上面代码中，只要`p1`、`p2`、`p3`之中有一个实例率先改变状态，`p`的状态就跟着改变。那个率先改变的 Promise 实例的返回值，就传递给`p`的回调函数。

`Promise.race()`方法的参数与`Promise.all()`方法一样，如果不是 Promise 实例，就会先调用下面讲到的`Promise.resolve()`方法，将参数转为 Promise 实例，再进一步处理。

```
Promise.race = function (promises) {
    return new Promise((resolve, reject) => {
        if (promises.length === 0) {
            return;
        } else {
            for (let i = 0; i < promises.length; i++) {
                Promise.resolve(promises[i]).then((data) => {
                    resolve(data);
                    return;
                }, (err) => {
                    reject(err);
                    return;
                });
            }
        }
    });
}
```



#### 5）Promise.prototype.catch()

`Promise.prototype.catch` 方法是 `.then(null, rejection)` 或 `.then(undefined, rejection)` 的别名，用于指定发生错误时的回调函数。

```javascript
Promise.prototype.catch = function (onRejected) {
    return this.then(null, onRejected);
}
```

#### 6）Promise.prototype.finally()

`finally`方法用于指定不管 Promise 对象最后状态如何，都会执行的操作。该方法是 ES2018 引入标准的。

```javascript
Promise.prototype.finally = function (callback) {
    return this.then((value) => {
        return Promise.resolve(callback()).then(() => {
            return value;
        });
    }, (err) => {
        return Promise.resolve(callback()).then(() => {
            throw err;
        });
    });
}
```

 

### 参考文档：

[Promises/A+ 规范（译文）](https://silinchen.com/p/promises-a-plus)

[Promises/A+ 规范（官方原文英文版）](https://promisesaplus.com/)

[阮一峰 - Promise 对象 - ECMAScriptS 6入门](http://es6.ruanyifeng.com/#docs/promise)

[Promise - JavaScript | MDN](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Promise)



觉得对您有帮助的，可以给我点个小 star。谢谢哦^_^