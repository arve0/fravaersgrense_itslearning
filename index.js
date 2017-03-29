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
    name: 'Attendance frontpage',
    url: /Attendance\/Teacher\/KeepAttendance\.aspx\?CourseId=/,
    onLoad: (contents) => {
      // redirect to attendance reports
      contents.executeJavaScript(`document.querySelector('#ctl00_PageTabs > ul > li:nth-child(3) > h2 > a').click()`)
    }
  }, {
    name: 'Attendance reports',
    url: /Attendance\/Teacher\/Reports\.aspx\?TermID=/,
    onLoad: (contents) => {
      // contents.openDevTools()
      contents.executeJavaScript(`
        // includes
        ${toArr}
        ${get}

        const selectEl = document.getElementById('ctl00_ContentPlaceHolder_TermsList');
        const terms = toArr(selectEl.options).map(term => term.value).filter(term => term)

        const absence = {};
        Promise.all(terms.map(async (term) => {
          const reports = toArr(document.querySelectorAll('a[href^="ReportForLearner.aspx"]'));
          await Promise.all(reports.map(${getStudentAbsence}))
          return absence;
        }))
      `, (res) => console.log(res[1]))
    }
  }
]

const webview = document.getElementById('view')
webview.addEventListener('console-message', (event) => {
  const msg = 'webview: ' + event.message
  event.level === 2 ? console.error(msg) : console.log(msg)
});

webview.addEventListener('did-finish-load', () => {

  const url = webview.getURL()
  console.log('URL: ' + url)

  steps.forEach((step) => {
    // strings should match exactly
    if (typeof step.url === 'string' && url === step.url) {
      console.log('Step: ' + step.url)
      step.onLoad(webview)
    } else if (typeof step.url !== 'string' && url.search(step.url) !== -1) {
      console.log('Step: ' + step.url)
      step.onLoad(webview)
    }
  })
})

// redirects
function login() {
  webview.loadURL(urls.prefix)
}
function courses() {
  webview.loadURL(urls.prefix + urls.courses)
}
function settings() {
  webview.loadURL(url.format({
    pathname: path.join(__dirname, 'settings.html'),
    protocol: 'file:',
    slashes: true
  }))
}

// helper functions

/**
 * Get HTML document from url. Resolves as DOM object.
 * 
 * @param {*string} url 
 * @returns {Promise}
 */
function get(url) {
  return new Promise((resolve, reject) => {
    var req = new XMLHttpRequest();
    req.addEventListener('load', reqListener);
    req.open('GET', url, true);
    req.send();

    function reqListener() {
      if (this.status !== 200) {
        return reject(new Error(`Got HTTP status code ${this.status}.`));
      }
      try {
        resolve(new DOMParser().parseFromString(this.responseText, 'text/html'));
      } catch (err) {
        reject(err);
      }
    }
  })
}

/**
 * convert arrLike to array
 */
function toArr (arrLike) { 
  return Array.prototype.slice.call(arrLike) 
}

/**
 * get student absence
 */
async function getStudentAbsence (report) {
  const url = report.href.replace(/TermID=[0-9]+/, 'TermID=' + term)
  const DOM = await get(url);

  const studentName = DOM.querySelector('#ctl00_PageHeader_TT').innerHTML.match(/: (.*)/)[1];
  const tableRows = '#ctl00_ContentPlaceHolder_AttendanceReport_AttendanceDataGrid_DataGrid_ctl00 tr';
  let rows = toArr(DOM.querySelectorAll(tableRows));
  // remove header rows
  rows = rows.filter(row => !row.querySelector('th'));
  // get what we need in each row
  rows = rows.map(row =>
    row.querySelector(
      'td[headers="ctl00_ContentPlaceHolder_AttendanceReport_AttendanceDataGrid_DataGrid_ctl06"] > div > div'
    ).innerHTML
    + ' ' + row.querySelector(
      'td[headers="ctl00_ContentPlaceHolder_AttendanceReport_AttendanceDataGrid_DataGrid_ctl02"] > span'
    ).innerHTML);

  // keep only rows with UÅ, TFU or TFE
  rows = rows.filter(row => {
    // absence that counts
    const absenceTypes = ['UÅ', 'TFU', 'TFE']
    return absenceTypes.reduce((keepRow, absenceType) => keepRow || row.search(absenceType) === 0, false)
  });

  // store/append to absence
  if (absence[studentName]) {
    absence[studentName] = absence[studentName].concat(rows);
  } else {
    absence[studentName] = rows;
  }
}