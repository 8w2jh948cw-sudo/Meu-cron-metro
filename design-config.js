'use strict';
window.APP_BUILD = {
  developerAvailable: true,
  version: '0.5.0-dev.0',
  baseVersion: '0.5.0',
  buildId: 'v050-unified-dev-1',
  designDefaults: {
    colors: {
      lightBg:'#F2F2F6', lightCard:'#FFFFFF', lightText:'#000000', lightSecondary:'#85858A', lightLine:'#E7E7E8', lightPlaceholder:'#C5C5C7', lightGlass:'rgba(255,255,255,.62)', lightFloatBorder:'rgba(255,255,255,.92)', lightUsed:'#F2F2F6',
      darkBg:'#000000', darkCard:'#1C1C1E', darkText:'#FFFFFF', darkSecondary:'#98989D', darkLine:'#38383A', darkPlaceholder:'#636366', darkGlass:'rgba(44,44,46,.72)', darkFloatBorder:'rgba(255,255,255,.12)', darkUsed:'#3A3A3C',
      delete:'#E22400'
    },
    sizes: {
      contentSide:18, contentTop:14, topbarHeight:54, headerButton:40, headerIcon:22, titleSize:17.5, topTabTitleSize:20,
      timerMinHeight:64, timerRadius:30, timerPadY:11, timerPadX:14, timerGap:10, timerIconSize:38, timerIconRadius:13, timerNameSize:15, timerTimeSize:24,
      floatingHeight:52, floatingRadius:20, floatingGap:10, totalTimeSize:18, addHeight:52, saveHeight:52, saveRadius:20, saveFontSize:16, saveIconSize:20, totalHeight:52, totalRadius:20, totalLabelSize:12, totalIconSize:19,
      settingsRadius:30, settingsRowHeight:56, settingsSide:18, settingsPadX:18,
      historyRadius:20, historyPadY:14, historyPadX:16, historyTitleSize:16, historyFilterHeight:44, historyFilterRadius:14, statsPanelPad:16,
      panelRadius:24, modalRadius:52, sheetCardRadius:30, tabIcon:25, tabFont:10.5,
      borderWidth:1, headerCircleBorder:2.5, iconStroke:1.8, tabIconStroke:1.85
    },
    shadow: { x:0, y:12, blur:36, spread:0, opacity:0.07, smallY:2, smallBlur:8, smallOpacity:0.035 },
    layout: { timerNameAlign:'left', timerTimeAlign:'right', totalJustify:'center', cardAlign:'center' },
    themePresets: [
      {id:'original',name:'Padrão',accent:'#007AFF',action:'#34C759'},
      {id:'blue',name:'Azul',accent:'#007AFF',action:'#007AFF'},
      {id:'green',name:'Verde',accent:'#34C759',action:'#34C759'},
      {id:'purple',name:'Roxo',accent:'#AF52DE',action:'#AF52DE'},
      {id:'pink',name:'Rosa',accent:'#FF2D55',action:'#FF2D55'},
      {id:'orange',name:'Laranja',accent:'#FF9500',action:'#FF9500'},
      {id:'indigo',name:'Índigo',accent:'#5856D6',action:'#5856D6'}
    ]
  }
};
