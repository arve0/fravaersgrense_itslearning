const url = require('url')
const path = require('path')

const urls = {
  prefix: 'https://stfk.itslearning.com/', // TODO: settings
  courses: 'Course/AllCourses.aspx',
  settings: localUrl('settings.html')
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
      contents.loadURL(urls.prefix + urls.courses)
    }
  }, {
    name: 'Courses',
    url: urls.prefix + urls.courses,
    onLoad: (contents) => {
      // change links to point to course attandace
      contents.executeJavaScript(`
        ${toArr}
        let courseLinks = toArr(document.querySelectorAll('a[href^="/main.aspx?CourseID"]'))
        courseLinks.forEach(link => {
          let ID = link.href.match(/CourseID=([0-9]+)/)[1]
          link.href = \`/Attendance/Teacher/KeepAttendance.aspx?CourseId=\${ID}\`
        })
      `)
    }
  }, {
    name: 'Attendance frontpage',
    url: /Attendance\/Teacher\/KeepAttendance\.aspx\?CourseId=/,
    onLoad: (contents) => {
      // select attendance reports
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
        ${parseDOM}
        ${get}

        const selectEl = document.getElementById('ctl00_ContentPlaceHolder_TermsList')
        const terms = toArr(selectEl.options).map(term => term.value).filter(term => term)

        const absence = {}
        Promise.all(terms.map(async (term) => {
          const reports = toArr(document.querySelectorAll('a[href^="ReportForLearner.aspx"]'))
          await Promise.all(reports.map(${getStudentAbsence}))
          return absence
        })).then(() => absence).catch(err => console.error(err))
      `, (res) => {
          const str = JSON.stringify(res)
          const b64 = btoa(str)
          contents.loadURL(localUrl('view.html') + `#${b64}`)
        })
    }
  }
]

const webview = document.getElementById('view')
webview.addEventListener('console-message', (event) => {
  const msg = 'webview: ' + event.message
  event.level === 2 ? console.error(msg) : console.log(msg)
});

webview.addEventListener('did-finish-load', () => {

  const currentUrl = webview.getURL()
  console.log('URL: ' + currentUrl)

  steps.forEach((step) => {
    // strings should match exactly
    if (typeof step.url === 'string' && currentUrl === step.url) {
      console.log('Step: ' + step.url)
      step.onLoad(webview)
    } else if (typeof step.url !== 'string' && currentUrl.search(step.url) !== -1) {
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
  webview.loadURL(urls.settings)
}

// helper functions

/**
 * get url of local file in current directory
 */
function localUrl(filename) {
  return url.format({
    pathname: path.join(__dirname, filename),
    protocol: 'file:',
    slashes: true
  })
}

/**
 * Get HTML document from url. Resolves as DOM object.
 *
 * @param {*string} url
 * @returns {Promise}
 */
function get(url) {
  // send cookies
  let opts = { credentials: 'same-origin' }

  return fetch(url, opts).then(response => {
    if (response.status >= 200 && response.status < 300) {
      return response.text()
    } else {
      let error = new Error(reponse.statusText)
      error.response = response
      throw error
    }
  }).then(parseDOM)
}

/**
 * takes text/html, returns DOM object
 */
function parseDOM(text) {
  return new DOMParser().parseFromString(text, 'text/html')
}


/**
 * convert arrLike to array
 */
function toArr(arrLike) {
  return Array.prototype.slice.call(arrLike)
}

/**
 * get student absence
 */
async function getStudentAbsence(report) {
  const url = report.href.replace(/TermID=[0-9]+/, 'TermID=' + term)
  const DOM = await get(url);

  const studentName = DOM.querySelector('#ctl00_PageHeader_TT').innerHTML.match(/: (.*)/)[1];
  const tableRows = '#ctl00_ContentPlaceHolder_AttendanceReport_AttendanceDataGrid_DataGrid_ctl00 tr';
  let rows = toArr(DOM.querySelectorAll(tableRows));
  // remove header rows
  rows = rows.filter(row => !row.querySelector('th'));
  // get what we need in each row
  rows = rows.map(row => {
    if (row.querySelector(
      'td[headers="ctl00_ContentPlaceHolder_AttendanceReport_AttendanceDataGrid_DataGrid_ctl06"] > div > div'
    ) === null) {
      return '';  // no attendance records
    }
    var s = row.querySelector(
      'td[headers="ctl00_ContentPlaceHolder_AttendanceReport_AttendanceDataGrid_DataGrid_ctl06"] > div > div'
    ).innerHTML
      + ' ' + row.querySelector(
        'td[headers="ctl00_ContentPlaceHolder_AttendanceReport_AttendanceDataGrid_DataGrid_ctl02"] > span'
      ).innerHTML
    return s
  })

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
