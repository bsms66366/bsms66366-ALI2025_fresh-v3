import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Text, FlatList, Pressable, Image } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import axios from 'axios';

export default function App() {

  const [isLoading, setLoading] = useState(true);
  const [data, setData] = useState([]);
  const filteredData = data.filter(item => item.category_id === 30);

  useEffect(() => {
  axios.get('https://placements.bsms.ac.uk/api/Dissection')
    //axios.get('http://192.168.1.20:8000/api/Video')
    //axios.get('http://127.0.0.1:8000/api/placements')
      .then(({ data }) => {
        console.log(data);
        //console.log("defaultApp -> data", data.name)
        setData(data)
      })
      .catch((error) => console.error(error))
      .finally(() => setLoading(false));
  }, []);

  

  return (
   
<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 15, backgroundColor: '#000' }}>
  <Image source={require('../../assets/images/interfaceIcons_Artboard25.png')}style={{ width: 250, height: 250, justifyContent: 'center',}} />

    <Text style={{ color: '#FFF', fontSize: 20, marginTop: 10, marginBottom:15, textAlign:"center"}}>INTRODUCTION TO DISSECTION VIDEOS</Text>
      {isLoading ? <ActivityIndicator /> : (
        <FlatList 
          data={filteredData}
          renderItem={({ item }) =>  {
            console.log("item", item)
            return ( 
            
                <Pressable onPress = {() => WebBrowser.openBrowserAsync(item.video)}>
               
               <Text style={styles.listItem}>{item.name}
                </Text>
              
              </Pressable> 
           
            )
          }}
          
        />
      )}
    </View> 
  );

      
 
const styles = StyleSheet.create({
  container: {
    flex: 1,
    //marginTop: Constants.statusBarHeight,
    backgroundColor: '#000',
  },

listItem: {
  flex: 1,  
  color:'#bcba40',
  backgroundColor: '#000',
    borderColor: '#bcba40',
    borderStyle:'dotted',
    borderRadius: 8,
    borderWidth: 1,
    padding: 8,
    marginVertical: 5,
    marginHorizontal: 8,
    marginBottom: 5
},
Logo: {
  height: 80,
  alignItems: 'center',
},
name: {
  fontFamily: 'Verdana',
  fontSize: 20,
  //fontWeight: "bold",
  color: "#000",

},
button: {
  alignItems: 'center',
  justifyContent: 'center',
  paddingVertical: 12,
  paddingHorizontal: 32,
  borderRadius: 20,
  elevation: 3,
  backgroundColor: 'black',
},
/*   listcontainer: {
  flexDirection: 'row',
  backgroundColor: '#bcba40',
  //borderColor: '#FAD607',
  //paddingTop: 5,
  borderRadius: 20,
  padding: 15,
  marginVertical: 5,
  marginHorizontal: 8,
  marginBottom: 15,
  alignItems: 'center', 
  fontWeight: 'bold',
  fontFamily: 'Verdana',
  //fontFamily: 'Roboto-Regular',
  fontSize: 20, 
 }, */
});

}
