const url = require('url')
const path = require('path')

const urls = {
  prefix: 'https://stfk.itslearning.com/', // TODO: settings
  courses: 'Course/AllCourses.aspx',
  settings: ''
}

let steps = [
  {
    name: 'Start page',
    url: urls.prefix,
    onLoad: (contents) => {
      contents.executeJavaScript(`
        // go to login page
        document.querySelector("#ctl00_ContentPlaceHolder1_federatedLoginWrapper > a").click()
      `)
    }
  }, {
    name: 'FEIDE login',
    url: /https:\/\/idp\.feide\.no\/simplesaml\/module\.php\/feide\/login.php\?asLen=/,
    onLoad: (contents) => {
      contents.executeJavaScript(`
        // save and get user/pass from localStorage
        const username = document.getElementById('username')
        const password = document.getElementById('password')

        username.value = localStorage.getItem('username')
        password.value = localStorage.getItem('password')

        username.onkeyup = store('username')
        password.onkeyup = store('password')

        function store (what) {
          return function (event) {
            localStorage.setItem(what, event.target.value)
          }
        }
      `);
    }
  }, {
    name: 'Front page',
    url: /DashboardMenu\.aspx\?LocationType=Hierarchy&LocationId=/,
    onLoad: (contents) => {
      // go to courses
      contents.loadURL(urls.prefix + 'Course/AllCourses.aspx')
    }
  }, {
    name: 'Course page',
    url: /ContentArea\/ContentArea\.aspx\?LocationID=[0-9]+&LocationType=1/,
    onLoad: (contents) => {
      // course selected -> go to absence reports
      const url = contents.getURL()
      const id = url.match(/ID=([0-9]+)/)[1]
      console.log('ID: ' + id)
      contents.loadURL(`${urls.prefix}/Attendance/Teacher/KeepAttendance.aspx?CourseId=${id}&TermId=0&Year=0`)
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

const contents = document.getElementById('view')

contents.addEventListener('did-finish-load', () => {

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

// redirects
function login() {
  contents.loadURL(urls.prefix)
}
function courses() {
  contents.loadURL(urls.prefix + urls.courses)
}
function settings() {
  contents.loadURL(url.format({
    pathname: path.join(__dirname, 'settings.html'),
    protocol: 'file:',
    slashes: true
  }))
}
