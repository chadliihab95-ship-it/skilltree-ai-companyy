export type Agent = { id:string; name:string; role:string; department:string; status:'online'|'idle'|'busy'; specialty:string };
export const departments = [
 {id:'strategy',name:'الاستراتيجية',en:'Strategy',icon:'◈',color:'#9b8cff'},
 {id:'marketing',name:'التسويق والنمو',en:'Marketing & Growth',icon:'✳',color:'#f5a45d'},
 {id:'sales',name:'المبيعات',en:'Sales',icon:'↗',color:'#57c7b5'},
 {id:'operations',name:'العمليات',en:'Operations',icon:'⌘',color:'#6da8ff'},
 {id:'finance',name:'المالية',en:'Finance',icon:'◉',color:'#e6c46b'},
 {id:'product',name:'المنتج والتقنية',en:'Product & Tech',icon:'⌬',color:'#c18cff'},
 {id:'research',name:'البحث والتحليل',en:'Research & Analytics',icon:'⌕',color:'#79c7e8'}
];
const roles = [
 ['strategy','مدير الاستراتيجية','تحليل السوق وتحديد الأولويات'],['strategy','محلل الأعمال','تحويل الأهداف إلى مؤشرات'],['strategy','مخطط النمو','بناء خطط النمو'],['strategy','مدير المشاريع','تنسيق المبادرات'],
 ['marketing','مدير التسويق','تخطيط الحملات'],['marketing','كاتب المحتوى','كتابة المحتوى والرسائل'],['marketing','خبير SEO','تحسين الظهور في البحث'],['marketing','محلل الجمهور','تحليل شرائح العملاء'],
 ['sales','مدير المبيعات','إدارة مسار البيع'],['sales','باحث العملاء','تأهيل العملاء المحتملين'],['sales','كاتب العروض','إعداد العروض التجارية'],['sales','مدير نجاح العملاء','الاحتفاظ بالعملاء'],
 ['operations','مدير العمليات','تحسين سير العمل'],['operations','منسق المهام','توزيع ومتابعة المهام'],['operations','مسؤول الجودة','مراجعة المخرجات'],['operations','مسؤول الموارد','تخطيط الموارد'],
 ['finance','مدير مالي','التخطيط المالي'],['finance','محلل التكاليف','تحليل المصروفات'],['finance','محاسب','تنظيم القيود والفواتير'],['finance','محلل المخاطر','تقييم المخاطر المالية'],
 ['product','مدير المنتج','إدارة خارطة الطريق'],['product','مهندس البرمجيات','تصميم الحلول التقنية'],['product','مصمم UX','تجربة المستخدم'],['product','مهندس الاختبار','اختبار الجودة'],
 ['research','باحث السوق','جمع وتحليل معلومات السوق'],['research','محلل البيانات','تحليل المؤشرات'],['research','باحث المنافسين','تحليل المنافسة'],['research','مراجع المعرفة','توثيق المعرفة والتحقق']
] as const;
export const agents: Agent[] = roles.map((r,i)=>({id:`agent-${i+1}`,department:r[0],name:r[1],role:r[1],specialty:r[2],status:(i%7===0?'busy':i%3===0?'idle':'online') as Agent['status']}));
export type Task = {id:string;title:string;department:string;assignee:string;priority:'عالية'|'متوسطة'|'منخفضة';status:'جديدة'|'قيد التنفيذ'|'بانتظار الموافقة'|'مكتملة';createdAt:string};
export const initialTasks: Task[] = [
 {id:'ST-001',title:'إعداد خطة إطلاق المنتج',department:'strategy',assignee:'مدير الاستراتيجية',priority:'عالية',status:'قيد التنفيذ',createdAt:'اليوم'},
 {id:'ST-002',title:'تحليل شرائح العملاء المستهدفة',department:'research',assignee:'محلل الجمهور',priority:'متوسطة',status:'مكتملة',createdAt:'اليوم'},
 {id:'ST-003',title:'مراجعة ميزانية الحملة',department:'finance',assignee:'مدير مالي',priority:'عالية',status:'بانتظار الموافقة',createdAt:'أمس'},
 {id:'ST-004',title:'تصميم تجربة التسجيل',department:'product',assignee:'مصمم UX',priority:'متوسطة',status:'جديدة',createdAt:'أمس'}
];
