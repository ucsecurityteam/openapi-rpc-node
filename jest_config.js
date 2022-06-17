module.exports = {
  "verbose": true,
  roots: ["test/unit/", "src/"],
 reporters: ["default"],
 collectCoverage: true,
 coverageReporters: ["text-summary", "html"],
 coverageDirectory: "./test_reports/coverage",
 collectCoverageFrom: [
     "!test/**"
 ],
  testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.jsx?$',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  setupFiles: ["./test/unit/mockers/init.js", "./test/unit/mockers/mock.js"],
  testEnvironment: 'node'
}
