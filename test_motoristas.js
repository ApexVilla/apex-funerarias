const url = "https://tcaakaiaepnkisushfmr.supabase.co/rest/v1/frota_motoristas?select=*";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjYWFrYWlhZXBua2lzdXNoZm1yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNTc1NzUsImV4cCI6MjA4NTczMzU3NX0.DeFJv7dua5RCt22wdBn2ftWhNpI0iXEeTnYWf-YyaN0";

fetch(url, {
  headers: {
    "apikey": key,
    "Authorization": "Bearer " + key
  }
}).then(r => r.json()).then(data => {
  console.log(JSON.stringify(data.slice(0, 5), null, 2));
}).catch(console.error);
