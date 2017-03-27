const { app, BrowserWindow } = require('electron')
const path = require('path')
const url = require('url')
const fs = require('fs')
let config
try {
  config = require('./config.json')
} catch (e) {
  config = {}
  fs.writeFileSync('config.json', JSON.stringify(config))
}

var prefix = 'https://stfk.itslearning.com/'; // TODO: config

let steps = [
  {
    url: prefix,
    onLoad: (contents) => {
      contents.openDevTools();
      contents.executeJavaScript(`document.querySelector("#ctl00_ContentPlaceHolder1_federatedLoginWrapper > a").click()`)
    }
  }, {
    url: /https:\/\/idp\.feide\.no\/simplesaml\/module\.php\/feide\/login.php\?asLen=/,
    onLoad: (contents) => {
      contents.executeJavaScript(`
        document.getElementById('username').value = '${config.username}';
        document.getElementById('password').value = '${config.password}';
        document.querySelector('form').submit()
      `);
    }
  }, {
    url: /DashboardMenu\.aspx\?LocationType=Hierarchy&LocationId=/,
    onLoad: (contents) => {
      contents.loadURL(prefix + 'Course/AllCourses.aspx')
    }
  },
/*   {
    url: 'https://stfk.itslearning.com/Course/AllCourses.aspx',
    onLoad: (contents) => {
      contents.executeJavaScript(`
          function q (str) { return Array.prototype.slice.call(document.querySelectorAll(str)) }
          var courses = q('.h-table-show-first-4-columns td > a > span');
          courses.map((course) => ({
            name: course.innerHTML,
            url: course.parentElement.href,
            id: course.parentElement.href.match(/ID=([0-9]+)/)[1]
          }))
        `).then((res) => {
          global.courses = res;
          global.courses.forEach(course => {
            steps.push({
              url: `https://stfk.itslearning.com/ContentArea/ContentArea.aspx?LocationID=${course.id}&LocationType=1`,
              onLoad: (contents) => {
                contents.executeJavaScript(`document.getElementById('link-status').click()`)
              }
            })

          })
        }).catch((err) => {
          console.log(err)
        })
    }
  },
*/  {
    url: /ContentArea\/ContentArea\.aspx\?LocationID=[0-9]+&LocationType=1/,
    onLoad: (contents) => {
      const url = contents.getURL()
      const id = url.match(/ID=([0-9]+)/)[1]
      console.log('ID: ' + id)
      contents.loadURL(`${prefix}/Attendance/Teacher/KeepAttendance.aspx?CourseId=${id}&TermId=0&Year=0`)
    }
  }, {
    url: /Attendance\/Teacher\/KeepAttendance\.aspx\?CourseId=/,
    onLoad: (contents) => {
      contents.executeJavaScript(`document.querySelector('#ctl00_PageTabs > ul > li:nth-child(3) > h2 > a').click()`)
    }
  }, {
    url: /Attendance\/Teacher\/Reports\.aspx\?TermID=/,
    onLoad: (contents) => {
      contents.executeJavaScript(`
        function toArr (arrLike) { return Array.prototype.slice.call(arrLike) }
        const selectEl = document.getElementById('ctl00_ContentPlaceHolder_TermsList');
        const terms = toArr(selectEl.options).map(term => term.value).filter(term => term)

        const absence = {};

        terms.forEach(term => {
          const reports = toArr(document.querySelectorAll('a[href^="ReportForLearner.aspx"]'));
          reports.forEach(report => {
            function reqListener () {
              const parser = new DOMParser();
              const DOM = parser.parseFromString(this.responseText, 'text/html');
              const name = DOM.querySelector('#ctl00_PageHeader_TT').innerHTML.match(/: (.*)/)[1];
              const table = '#ctl00_ContentPlaceHolder_AttendanceReport_AttendanceDataGrid_DataGrid_ctl00 tr';

              let rows = toArr(DOM.querySelectorAll(table));
              rows = rows.filter(row => !row.querySelector('th'));
              rows = rows.map(row =>
                row.querySelector(
                  'td[headers="ctl00_ContentPlaceHolder_AttendanceReport_AttendanceDataGrid_DataGrid_ctl06"] > div > div'
                ).innerHTML);
              rows = rows.filter(row => row === 'UÅ' || row === 'TFU');
              if (absence[name]) {
                absence[name] = absence[name].concat(rows);
              } else {
                absence[name] = rows;
              }
            }

            var oReq = new XMLHttpRequest();
            oReq.overrideMimeType('text/xml');
            oReq.addEventListener('load', reqListener);
            var url = report.href.replace(/TermID=[0-9]+/, 'TermID=' + term)
            oReq.open('GET', url, true);
            oReq.send();
          })
        })
      `)
    }
  }
]

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win

function createWindow() {
  // Create the browser window.
  win = new BrowserWindow({ width: 800, height: 600 })
  const contents = win.webContents;

  // and load the index.html of the app.
  if (!config.username || !config.password) {
    win.loadURL(url.format({
      pathname: path.join(__dirname, 'settings.html'),
      protocol: 'file:',
      slashes: true
    }))
    contents.openDevTools();
  } else {
    win.loadURL('https://stfk.itslearning.com')
  }

  // Open the DevTools.
  contents.on('did-finish-load', () => {

    const url = contents.getURL()
    console.log('URL: ' + url)

    steps.forEach((step) => {
      // strings should match exactly
      if (typeof step.url === 'string' && url === step.url) {
        console.log('Step: ' + step.url)
        step.onLoad(contents)
      } else if (typeof step.url !== 'string' && url.search(step.url) !== -1) {
        console.log('Step: ' + step.url)
        step.onLoad(contents)
      }
    })
  })

  // Emitted when the window is closed.
  win.on('closed', () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    win = null
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow)

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
  if (win === null) {
    createWindow()
  }
})
