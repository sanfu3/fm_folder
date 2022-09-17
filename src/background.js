'use strict'

import { app, protocol, BrowserWindow, ipcMain, dialog } from 'electron'
import { createProtocol } from 'vue-cli-plugin-electron-builder/lib'
const isDevelopment = process.env.NODE_ENV !== 'production'
const path = require('path')
const fs = require('fs')
const dbUtils = require('@/utils/dbUtils')
const fileUtils = require('@/utils/fileUtils')
const userUtils = require('@/utils/userUtils')
const childProcess = require('child_process');



// Scheme must be registered before the app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true } }
])




async function createWindow() {


  // Create the browser window.
  const win = new BrowserWindow({
    width: 1200,
    height: 750,
    minWidth: 950,
    minHeight: 650,
    center: true,
    backgroundColor: '#f1f1f1',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: "#fff", symbolColor: "black" },

    webPreferences: {

      // Use pluginOptions.nodeIntegration, leave this alone
      // See nklayman.github.io/vue-cli-plugin-electron-builder/guide/security.html#node-integration for more info
      nodeIntegration: true,
      //上下文隔离
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }

  })
// setInterval(()=>{
//   win.webContents.send('hello',{data: 'world'})
// },1000)


  //监听
  ipcMain.on('newAvatar', (event, attr, userId) => {


    dialog.showOpenDialog({
      title: '选择图片',
      filters: [{
        name: 'image',
        extensions: ['jpeg', 'png', 'jpg']
      }],
      buttonLabel: '选择'
    }).then((res) => {
      console.log(res.filePaths.length);
      if (res.filePaths.length > 0) {
        //移动文件
        fileUtils.getFileMd5(res.filePaths[0], md5 => {
          const dist = md5 + path.extname(res.filePaths[0])
          fs.copyFileSync(res.filePaths[0], 'src/assets/' + dist)
          userUtils.updateUser(attr, userId, dist)
        })
      } else {
        console.log(1);
      }
    })
  })
  async function handleFileOpen() {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: '选择文件',
      properties: ['openFile', 'openDirectory', 'multiSelections'],
      buttonLabel: '选择'
    })
    if (canceled) {
      return
    } else {
      return filePaths
    }
  }
  ipcMain.handle('saveFilesObj', handleFileOpen)


  var httpFileServer = childProcess.fork(process.env.NODE_ENV == "development" ? "./src/child_process/httpServer.js" : "./resources/httpServer.js")
  var netFindAndFileBroadcast = childProcess.fork(process.env.NODE_ENV == "development" ? "./src/child_process/netFindAndFileBroadcast.js" : "./resources/netFindAndFileBroadcast.js")



  //接收子进程的消息
  netFindAndFileBroadcast.on('message', (msg) => {
    console.log('from child: ' + JSON.stringify(JSON.parse(msg)))
  });
  httpFileServer.on('message', msg => {
    console.log(msg);
  })



  //用户登录提醒
  ipcMain.on('ding', () => {
    netFindAndFileBroadcast.send({ type: 'ding', data: fs.readFileSync('src/file_broadcast/lastFileBroadcastJson.json').toLocaleString() })   //客户端不仅需要接收还要返回，用户登录时使用
  })

  ipcMain.on('share', (event, user) => {
    userUtils.getMyShareFileListData(user, broadcastInfo => {
      fs.writeFile('src/file_broadcast/lastFileBroadcastJson.json', JSON.stringify(broadcastInfo), err => {
        if (err) throw err
        netFindAndFileBroadcast.send({ type: 'broadcast', data: broadcastInfo })   //客户端只需要接收，分享表更新操作时使用
      })
    })
  })

  var downloadFile = childProcess.fork(process.env.NODE_ENV == "development" ? "./src/child_process/downloadFile.js" : "./resources/downloadFile.js")

  downloadFile.on('message', msg => {
    win.webContents.send('downloadProgress',msg)
   })
  ipcMain.on('download', (event, val) => {
    downloadFile.send({type: 'start',data: val})
    fs.writeFileSync('src/file_broadcast/recordAwaitDownloadQueue.json',JSON.stringify(val))
  })

  ipcMain.on('singlePause',(event,val)=>{
    downloadFile.send({type:'singlePause',data: val})
  })
 
  ipcMain.on('singleResume',(event,val)=>{
    
    downloadFile.send({type:'singleResume',data:val})
  })


  ipcMain.on('singleCancel',(e,val)=>{
    downloadFile.send({type: 'singleCancel',data:val})
  })
  
  ipcMain.on('allPause',(e,val)=>{
    downloadFile.send({type: 'allPause',data: val})
  })

  ipcMain.on('allStart',(e,val)=>{

    downloadFile.send({type:'allStart',data: val})
  })

  ipcMain.on('allCancel',(e,val)=>{
      downloadFile.send({type: 'allCancel',data: val})
  })

  ipcMain.on('delDownloadedQueueItem',(event,val)=>{
    downloadFile.send({type: 'delDownloadedQueueItem',data:val})
  })


  if (process.env.WEBPACK_DEV_SERVER_URL) {
    //调试模式开关
    // Load the url of the dev server if in development mode
    await win.loadURL(process.env.WEBPACK_DEV_SERVER_URL)
    // if (!process.env.IS_TEST) win.webContents.openDevTools()
  } else {
    createProtocol('app')
    // Load the index.html when not in development
    win.loadURL('app://./index.html')
  }
}


// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', async () => {
  // if (isDevelopment && !process.env.IS_TEST) {
  //   // Install Vue Devtools
  //   try {
  //     await installExtension(VUEJS_DEVTOOLS)
  //   } catch (e) {
  //     console.error('Vue Devtools failed to install:', e.toString())
  //   }
  // }

  //初始化数据库
  dbUtils.createDB(db => { })
  createWindow()
})

// Exit cleanly on request from parent process in development mode.
if (isDevelopment) {
  if (process.platform === 'win32') {
    process.on('message', (data) => {
      if (data === 'graceful-exit') {
        app.quit()
      }
    })
  } else {
    process.on('SIGTERM', () => {
      app.quit()
    })
  }
}
