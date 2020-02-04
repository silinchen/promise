const Promise = require('./promise')

// const p = new Promise((resolve, reject) => {
//   console.log(1)
//   // resolve('hello, promise')
//   setTimeout(() => {
//     // resolve('hello, promise')
//   })
// })

// p.then((value) => {
//   console.log(value)
// }, err => {
//   console.log(err)
// })
// console.log(2)

/**
 * Promise.deferred
 */
const fs = require('fs')
const readfile = url => {
  let dfd = Promise.defer()
  fs.readFile(url, 'utf-8', (err, data) => {
    if(err) dfd.reject(err)
    dfd.resolve(data)
  })
  return dfd.promise
}

// readfile('./package.json').then(data => console.log(data))

/**
 * Promise.all
 */
// Promise.all([1, 2, 3, readfile('./package.json'), readfile('./package.json'), 6]).then(data => {
//   console.log(data)
// })

