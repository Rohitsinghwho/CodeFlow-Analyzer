import createApp from "./api/createApp.js";
import dotenv from 'dotenv';

dotenv.config();



createApp().listen(process.env.PORT||3000,()=>{
    console.log('Server is up and running !');
})
