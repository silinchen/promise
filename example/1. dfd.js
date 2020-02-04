const Promise = require('../promise')
const fs = require('fs')

// const readfile = url => {
//   return new Promise((resolve, reject) => { // 一层嵌套
//     fs.readFile(url, 'utf-8', (err, data) => { // 二层嵌套
//       if(err) reject(err)
//       resolve(data)
//     })
//   })
// }

const readfile = url => {
  let dfd = Promise.defer()
  // 减少了一层嵌套
  fs.readFile(url, 'utf-8', (err, data) => {
    console.log(err)
    console.log(data)
    if(err) dfd.reject(err)
    dfd.resolve(data)
  })
  return dfd.promise
}

readfile('package.json').then(data => console.log(data))